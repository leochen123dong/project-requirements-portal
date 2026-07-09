#!/usr/bin/env python3
"""Strip empty-version entries from package-lock.json.

Workaround for npm 10/11 quirk: rollup@4.x declares ~25 platform-specific
binaries (arm/musl/riscv64/win32/...) as optionalDependencies. When
npm writes the lockfile on amd64 Linux, the binaries that don't match
the current platform get entries with ONLY {"dev": true, "optional": true}
and no "version" field. Then `npm install` (and `npm ci`) fails to parse
these empty entries with:

  npm error Invalid Version:

Fix: strip those empty entries before `npm install`. `npm install`
will then re-resolve missing optional deps from the registry (skipping
platform-incompatible ones), producing a fully-working node_modules.

This script is idempotent and safe to run multiple times.
"""

import json
import sys
from pathlib import Path

LOCK_PATH = Path(__file__).resolve().parent.parent / "package-lock.json"


def main() -> int:
    if not LOCK_PATH.exists():
        print(f"[strip-empty-versions] no lock at {LOCK_PATH} — skipping", file=sys.stderr)
        return 0

    data = json.loads(LOCK_PATH.read_text())
    packages = data.get("packages", {})

    removed = []
    for key in list(packages.keys()):
        if not key:
            # Root package "" — keep even if version missing
            continue
        if not packages[key].get("version"):
            removed.append(key)
            del packages[key]

    # Also strip from top-level dependencies map
    deps = data.get("dependencies", {})
    for key in removed:
        deps.pop(key, None)

    LOCK_PATH.write_text(json.dumps(data, indent=2) + "\n")
    print(f"[strip-empty-versions] removed {len(removed)} empty-version entries from {LOCK_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())