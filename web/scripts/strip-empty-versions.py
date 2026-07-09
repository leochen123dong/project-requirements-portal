#!/usr/bin/env python3
"""Strip empty-version entries from package-lock.json.

Workaround for a known npm issue where optional platform-specific
binaries (e.g. rollup's linux-arm/riscv64 variants) get written to
package-lock.json with only {"dev": true, "optional": true} and no
"version" field. This causes `npm ci` / `npm install` to fail with
"Invalid Version:" on amd64 Linux runners (where these binaries are
not installed locally).

We strip the empty entries from the lock before installation. `npm ci`
will then either succeed (treats them as optional and skips), or
`npm install` will re-resolve them with proper versions.
"""

import json
import sys
from pathlib import Path

LOCK_PATH = Path(__file__).resolve().parent.parent / "package-lock.json"


def main() -> int:
    if not LOCK_PATH.exists():
        print(f"[strip-empty-versions] no lock file at {LOCK_PATH}", file=sys.stderr)
        return 0

    data = json.loads(LOCK_PATH.read_text())
    packages = data.get("packages", {})

    removed = []
    for key in list(packages.keys()):
        entry = packages[key]
        if not entry.get("version"):
            # Keep the root package even if it has no version (shouldn't happen)
            if key == "":
                continue
            removed.append(key)
            del packages[key]

    # Also strip from top-level dependencies map if present
    deps = data.get("dependencies", {})
    for key in removed:
        deps.pop(key, None)

    LOCK_PATH.write_text(json.dumps(data, indent=2) + "\n")
    print(f"[strip-empty-versions] removed {len(removed)} empty-version entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())