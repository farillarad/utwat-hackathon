"""Owner: Amir — the batch (PRD v2 §9): 12 levels x 2 agents x 3 trials x 2 wrapper states = 144 runs.

    python batch_runner.py --pilot                 # T6: 12 levels x browser-use x 1 trial, wrapper off, + wrapper-on on L5 and L7 (the demo beat and the wrapper blind spot)
    python batch_runner.py                         # full 144, 4 parallel Steel sessions
    python batch_runner.py --agents browser-use --trials 2 --parallel 8
    python batch_runner.py --dry-run               # print the plan, run nothing

Each run is a separate subprocess of the matching runner (one level, one trial, one
wrapper state), so a crash or hang in one run can't take the batch down. Runs are
capped at 40 steps by the runners and at --run-timeout seconds here. Results live on
the server (write-through to data/runs); afterwards:

    npx tsx scripts/check-results.ts               # T7

Batch runs happen BEFORE the demo, never during.
"""
from __future__ import annotations

import argparse
import itertools
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from gauntlet_client import ALL_LEVELS, public_url

load_dotenv()

HERE = Path(__file__).parent
RUNNERS = {"browser-use": "browser_use_runner.py", "raw-llm-loop": "raw_llm_loop.py"}


def api_keys() -> list[str]:
    """Anthropic keys to spread the batch across. ANTHROPIC_API_KEYS=key1,key2,key3 in .env
    (falls back to the single ANTHROPIC_API_KEY). Runs are dealt round-robin, so the cost
    splits evenly: three keys -> each pays about a third of the batch."""
    multi = [k.strip() for k in os.environ.get("ANTHROPIC_API_KEYS", "").split(",") if k.strip()]
    single = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    return multi or ([single] if single else [])


def key_label(key: str) -> str:
    return f"key..{key[-4:]}"


@dataclass(frozen=True)
class Job:
    agent: str
    level: int
    trial: int
    wrapper: bool

    def cmd(self, steel: bool, max_steps: int) -> list[str]:
        cmd = [sys.executable, str(HERE / RUNNERS[self.agent]), "--levels", str(self.level), "--trial", str(self.trial),
               "--max-steps", str(max_steps), "--headless"]
        if self.wrapper:
            cmd.append("--wrapper")
        if steel:
            cmd.append("--steel")
        return cmd

    def label(self) -> str:
        return f"{self.agent:<13} L{self.level:<2} t{self.trial} {'wrap' if self.wrapper else 'off '}"


def plan(args) -> list[Job]:
    if args.pilot:  # T6
        jobs = [Job("browser-use", l, 1, False) for l in ALL_LEVELS]
        jobs += [Job("browser-use", 5, 1, True), Job("browser-use", 7, 1, True)]  # demo beat (optimistic UI) + tampering blind spot
        return jobs
    levels = ALL_LEVELS if args.levels == "all" else [int(x) for x in args.levels.split(",")]
    wrappers = [False, True] if args.wrapper == "both" else [args.wrapper == "on"]
    return [Job(a, l, t, w) for a, w, l, t in itertools.product(args.agents, wrappers, levels, range(1, args.trials + 1))]


def run_job(job: Job, args, log_dir: Path, key: str) -> tuple[Job, int, float, str]:
    log = log_dir / f"{job.agent}_L{job.level}_t{job.trial}_{'wrap' if job.wrapper else 'off'}.log"
    t0 = time.time()
    with open(log, "w", encoding="utf-8") as fh:
        fh.write(f"BATCH: using {key_label(key)}\n")
        try:
            proc = subprocess.run(job.cmd(not args.local, args.max_steps), stdout=fh, stderr=subprocess.STDOUT,
                                  timeout=args.run_timeout, cwd=HERE,
                                  env={**os.environ, "PYTHONIOENCODING": "utf-8", "ANTHROPIC_API_KEY": key})
            code = proc.returncode
        except subprocess.TimeoutExpired:
            fh.write(f"\nBATCH: killed after {args.run_timeout}s\n")
            code = 124
    return job, code, time.time() - t0, str(log)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--agents", nargs="+", default=list(RUNNERS), choices=list(RUNNERS))
    p.add_argument("--levels", default="all")
    p.add_argument("--trials", type=int, default=3)
    p.add_argument("--wrapper", choices=["both", "on", "off"], default="both")
    p.add_argument("--parallel", type=int, default=4, help="concurrent Steel sessions (check the plan's limit first, §9.1)")
    p.add_argument("--max-steps", type=int, default=40)
    p.add_argument("--run-timeout", type=int, default=600, help="seconds before a run is killed")
    p.add_argument("--pilot", action="store_true", help="T6 pilot: 12 x browser-use x 1 trial wrapper-off + 2 wrapper-on")
    p.add_argument("--key-index", type=int, default=None,
                   help="use only the Nth key (0-based) from ANTHROPIC_API_KEYS — for splitting the batch by person/levels")
    p.add_argument("--local", action="store_true", help="local headless Chromium instead of Steel (dev only)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    jobs = plan(args)
    keys = api_keys()
    if args.key_index is not None:
        if not 0 <= args.key_index < len(keys):
            print(f"--key-index {args.key_index} out of range (have {len(keys)} key(s))", file=sys.stderr)
            return 2
        keys = [keys[args.key_index]]
    est_per_run = 0.18  # measured in the pilot (§9.2): $0.16 browser-use, $0.20 raw loop
    print(f"{len(jobs)} runs, parallel={args.parallel}, steel={not args.local}, base={public_url()}")
    print(f"est. cost ~${len(jobs) * est_per_run:.0f} total across {len(keys)} key(s) "
          f"(~${len(jobs) * est_per_run / max(1, len(keys)):.0f} each): {', '.join(key_label(k) for k in keys) or 'NONE'}")
    if args.dry_run:
        for i, j in enumerate(jobs):
            print(f"  {j.label()}  {key_label(keys[i % len(keys)]) if keys else ''}")
        return 0
    if not args.local and not os.environ.get("STEEL_API_KEY"):
        print("STEEL_API_KEY not set (use --local for a dev run)", file=sys.stderr)
        return 2
    if not keys:
        print("no Anthropic key: set ANTHROPIC_API_KEYS=k1,k2,k3 or ANTHROPIC_API_KEY", file=sys.stderr)
        return 2

    log_dir = HERE.parent / "data" / "batch-logs" / time.strftime("%Y%m%d-%H%M%S")
    log_dir.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    failures = 0
    with ThreadPoolExecutor(max_workers=args.parallel) as pool:
        futures = [pool.submit(run_job, j, args, log_dir, keys[i % len(keys)]) for i, j in enumerate(jobs)]
        for i, fut in enumerate(as_completed(futures), 1):
            job, code, secs, log = fut.result()
            status = "ok " if code == 0 else f"exit {code}"
            failures += code != 0
            print(f"[{i:>3}/{len(jobs)}] {job.label()}  {status}  {secs:5.0f}s  {log if code else ''}", flush=True)
    mins = (time.time() - t0) / 60
    print(f"\ndone: {len(jobs) - failures}/{len(jobs)} runner processes exited cleanly in {mins:.1f} min; logs in {log_dir}")
    print("next: npx tsx scripts/check-results.ts")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
