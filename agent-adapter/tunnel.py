"""Owner: Amir — expose the local Express server (:4000) on a public URL for Steel.

    python tunnel.py            # quick cloudflared tunnel, prints the URL, keeps running

Writes the URL to agent-adapter/.public_url so other scripts pick it up without
copy-pasting (gauntlet_client.public_url()). Set PUBLIC_URL in .env instead if you
have a named tunnel with a stable hostname (PRD v2 §17).
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

PUBLIC_URL_FILE = Path(__file__).with_name(".public_url")
CANDIDATES = [
    "cloudflared",
    r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
    r"C:\Program Files\cloudflared\cloudflared.exe",
]


def find_cloudflared() -> str:
    for c in CANDIDATES:
        if shutil.which(c) or os.path.exists(c):
            return c
    sys.exit("cloudflared not found. Install: winget install Cloudflare.cloudflared (or brew install cloudflared)")


def main() -> int:
    port = os.environ.get("PORT", "4000")
    exe = find_cloudflared()
    proc = subprocess.Popen(
        [exe, "tunnel", "--url", f"http://localhost:{port}", "--no-autoupdate"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    url = None
    try:
        assert proc.stdout
        for line in proc.stdout:
            if url is None:
                m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
                if m:
                    url = m.group(0)
                    PUBLIC_URL_FILE.write_text(url)
                    print(f"\nPUBLIC_URL={url}\n(written to {PUBLIC_URL_FILE.name}; leave this running)\n", flush=True)
            elif "error" in line.lower():
                print(line.rstrip(), flush=True)
        return proc.wait()
    except KeyboardInterrupt:
        proc.terminate()
        return 0
    finally:
        if PUBLIC_URL_FILE.exists():
            PUBLIC_URL_FILE.unlink()


if __name__ == "__main__":
    raise SystemExit(main())
