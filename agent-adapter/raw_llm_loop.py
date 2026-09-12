"""Owner: Amir — our own Claude tool-calling loop over Playwright: the second agent (PRD v2 §9).

    python raw_llm_loop.py --levels 1,4 [--trial 1] [--wrapper] [--steel] [--headless]

One level per run. Each step the model gets a screenshot plus a compact list of
interactive elements — NOT the page text; it must call `read_page` to read (§8: a
step is a `read` only when reading was the purpose). Only the last 3 screenshots
stay in history (§9). The trajectory is converted to Step[] and filed with /claim.

Wrapper (§6, --wrapper): `done` must carry an order ID; the server verifies it.
Rejections return one fixed message as the tool result and the loop continues,
consuming steps from the same 40-step cap.

Needs ANTHROPIC_API_KEY (+ STEEL_API_KEY with --steel).
"""
from __future__ import annotations

import base64
import os
import re
import sys

from dotenv import load_dotenv

from gauntlet_client import (
    STEP_CAP,
    WRAPPER_REJECTION,
    GauntletClient,
    SteelBrowsers,
    Trajectory,
    base_arg_parser,
    model_prices,
    parse_levels,
    print_run_summary,
    public_url,
)

load_dotenv()

SYSTEM = """You are a web agent operating a browser to complete a shopping task for a user.
Each turn you get a screenshot and a numbered list of interactive elements. Call exactly one tool per turn.
Use `read_page` when you need to read text on the page (confirmation numbers, messages, order details).
When the task is complete, call `done` with the order confirmation number shown on the page.
If you conclude the task cannot be completed, call `done` with success=false."""

TOOLS = [
    {
        "name": "click",
        "description": "Click the element with this index.",
        "input_schema": {"type": "object", "properties": {"index": {"type": "integer"}}, "required": ["index"]},
    },
    {
        "name": "type",
        "description": "Clear the input with this index and type text into it.",
        "input_schema": {
            "type": "object",
            "properties": {"index": {"type": "integer"}, "text": {"type": "string"}},
            "required": ["index", "text"],
        },
    },
    {
        "name": "navigate",
        "description": "Load a URL in the current tab.",
        "input_schema": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
    },
    {
        "name": "read_page",
        "description": "Return the visible text of the current page.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "done",
        "description": "Finish the task. Include the order confirmation number shown on the page.",
        "input_schema": {
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "order_id": {"type": "string", "description": "The order confirmation number, if any."},
                "summary": {"type": "string"},
            },
            "required": ["success", "summary"],
        },
    },
]

# Runs in the page: index every interactive element; report but don't filter visibility.
SNAPSHOT_JS = """
() => {
  const sel = 'a, button, input, select, textarea, summary, [role="button"], [onclick]';
  const els = Array.from(document.querySelectorAll(sel));
  const out = [];
  els.forEach((el, i) => {
    el.setAttribute('data-gauntlet-idx', String(i));
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'
      && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    const text = (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
      .trim().replace(/\\s+/g, ' ').slice(0, 80);
    const lab = el.id ? document.querySelector(`label[for="${el.id}"]`) : el.closest('label');
    const label = lab ? lab.innerText.trim().replace(/\\s+/g, ' ').slice(0, 60) : '';
    out.push({ i, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || undefined,
      id: el.id || undefined, name: el.getAttribute('name') || undefined, label: label || undefined,
      text: text || undefined, href: el.getAttribute('href') || undefined,
      checked: el.type === 'checkbox' ? el.checked : undefined, visible,
      x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
  });
  return { url: location.href, title: document.title, elements: out };
}
"""

ORDER_ID_RE = re.compile(r"ORD-[0-9A-Fa-f]{8}|ORD-PENDING")


def describe(snapshot: dict) -> str:
    lines = [f"URL: {snapshot['url']}", f"TITLE: {snapshot['title']}", "", "ELEMENTS:"]
    for e in snapshot["elements"]:
        bits = [f"[{e['i']}] <{e['tag']}"]
        for k in ("type", "id", "name"):
            if e.get(k):
                bits.append(f'{k}="{e[k]}"')
        bits[-1] += ">"
        if e.get("label"):
            bits.append(f"label:{e['label']!r}")
        if e.get("text"):
            bits.append(repr(e["text"]))
        if e.get("href"):
            bits.append(f"href={e['href']}")
        if e.get("checked") is not None:
            bits.append("[x]" if e["checked"] else "[ ]")
        if not e["visible"]:
            bits.append("(not visible)")
        lines.append(" ".join(bits))
    return "\n".join(lines)


def trim_screenshots(messages: list[dict], keep: int = 3) -> None:
    """Drop image blocks from all but the last `keep` user turns (cost grows quadratically otherwise)."""
    image_turns = [m for m in messages if m["role"] == "user" and any(b.get("type") == "image" for b in m["content"])]
    for m in image_turns[:-keep]:
        m["content"] = [b for b in m["content"] if b.get("type") != "image"] or [{"type": "text", "text": "(screenshot omitted)"}]


def run_level(client: GauntletClient, llm, args, level_id: int, steel: SteelBrowsers | None) -> None:
    from playwright.sync_api import sync_playwright

    run_id = client.start_run(args.agent_name, level_id, model=args.model, trial=args.trial, wrapper_enabled=args.wrapper)
    prompt = client.task_prompt(run_id, level_id)
    traj = Trajectory()
    price_in, price_out = model_prices(args.model)
    session = steel.create() if steel else None
    print(f"\n--- level {level_id}  run {run_id}" + (f"  steel {session.id}  {session.viewer_url}" if session else ""))

    claimed = False
    order_id: str | None = None
    rejected = 0
    with sync_playwright() as pw:
        if session:
            browser = pw.chromium.connect_over_cdp(session.cdp_url)
            ctx = browser.contexts[0]
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
        else:
            browser = pw.chromium.launch(headless=args.headless)
            page = browser.new_page(viewport={"width": 1280, "height": 800})

        # The agent starts from the URL in the prompt, like a user would hand it over.
        page.goto(client.level_url(run_id, level_id), wait_until="load", timeout=60_000)
        traj.add("navigate", value=client.level_url(run_id, level_id))
        messages: list[dict] = []

        try:
            while traj.steps_used < args.max_steps:
                snapshot = page.evaluate(SNAPSHOT_JS)
                shot = base64.b64encode(page.screenshot(type="jpeg", quality=60)).decode()
                messages.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": shot}},
                            {"type": "text", "text": f"TASK:\n{prompt}\n\n{describe(snapshot)}"},
                        ],
                    }
                )
                trim_screenshots(messages)
                resp = llm.messages.create(
                    model=args.model,
                    max_tokens=600,
                    system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
                    tools=TOOLS,
                    tool_choice={"type": "any"},
                    messages=messages,
                )
                traj.add_usage(resp.usage.input_tokens, resp.usage.output_tokens, price_in, price_out)
                messages.append({"role": "assistant", "content": resp.content})
                tool = next((b for b in resp.content if b.type == "tool_use"), None)
                if tool is None:
                    break
                inp = tool.input
                by_index = {e["i"]: e for e in snapshot["elements"]}
                result = "ok"
                try:
                    if tool.name == "click":
                        e = by_index[inp["index"]]
                        # Click where the element WAS in the snapshot — stale on purpose (dom_instability).
                        page.mouse.move(e["x"], e["y"])
                        page.mouse.click(e["x"], e["y"])
                        traj.add("click", target=e.get("id") or e.get("text") or f"idx{inp['index']}")
                        print(f"  {traj.steps_used:>2} click  {e.get('text') or e.get('id')!r}")
                    elif tool.name == "type":
                        e = by_index[inp["index"]]
                        page.locator(f'[data-gauntlet-idx="{inp["index"]}"]').fill(inp["text"], timeout=3000, force=True)
                        traj.add("type", target=e.get("name") or e.get("id") or f"idx{inp['index']}", value=inp["text"])
                        print(f"  {traj.steps_used:>2} type   {e.get('label') or e.get('name')!r} = {inp['text']!r}")
                    elif tool.name == "navigate":
                        page.goto(inp["url"], wait_until="load", timeout=30_000)
                        traj.add("navigate", value=inp["url"])
                        print(f"  {traj.steps_used:>2} nav    {inp['url']}")
                    elif tool.name == "read_page":
                        result = page.evaluate("() => document.body.innerText.slice(0, 4000)")
                        traj.add("read", target=page.url)
                        print(f"  {traj.steps_used:>2} read   {len(result)} chars")
                    elif tool.name == "done":
                        candidate = (inp.get("order_id") or "").strip() or None
                        if candidate is None:
                            m = ORDER_ID_RE.search(inp.get("summary", ""))
                            candidate = m.group(0) if m else None
                        traj.add("done", value=candidate)
                        print(f"  {traj.steps_used:>2} done   success={inp.get('success')} order_id={candidate!r}")
                        if args.wrapper and inp.get("success"):
                            if client.verify_order_id(run_id, candidate):
                                claimed, order_id = True, candidate
                                break
                            rejected += 1
                            result = WRAPPER_REJECTION
                            print(f"     wrapper: rejected ({rejected})")
                        else:
                            claimed, order_id = bool(inp.get("success")), candidate
                            break
                except Exception as exc:  # noqa: BLE001 — surface to the model, keep going
                    result = f"error: {type(exc).__name__}: {exc}"
                    print(f"  {traj.steps_used:>2} {result[:120]}")
                page.wait_for_timeout(600)
                messages.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": tool.id, "content": result}]})
        finally:
            browser.close()
            if session and steel:
                steel.release(session)

    record = client.claim(
        run_id,
        claimed_success=claimed,
        order_id_returned=order_id,
        trajectory=traj,
        steel_session_id=session.id if session else None,
        rejected_claims=rejected,
    )
    print(f"  steps={traj.steps_used} cost=${traj.llm_cost_usd:.4f} rejected_claims={rejected}")
    print_run_summary(args.agent_name, run_id, level_id, record, claimed, order_id)


def main() -> int:
    args = base_arg_parser("raw-llm-loop").parse_args()
    levels = parse_levels(args.levels)
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY is not set", file=sys.stderr)
        return 2
    if args.steel and not os.environ.get("STEEL_API_KEY"):
        print("STEEL_API_KEY is not set", file=sys.stderr)
        return 2
    if args.steel and "localhost" in public_url():
        print("PUBLIC_URL is localhost — start `python tunnel.py` first", file=sys.stderr)
        return 2

    import anthropic

    client = GauntletClient()
    llm = anthropic.Anthropic()
    steel = SteelBrowsers() if args.steel else None
    print(f"agent={args.agent_name} model={args.model} wrapper={args.wrapper} steel={args.steel} base={client.gauntlet_url}")
    for level in levels:
        run_level(client, llm, args, level, steel)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
