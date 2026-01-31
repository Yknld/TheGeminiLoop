#!/usr/bin/env python3
"""
Pull an interactive_pages module from Supabase Storage (lesson_assets bucket)
into local modules/<module_id>/.

Usage:
  # By storage prefix (full path under lesson_assets):
  python pull_from_supabase.py "2202c52b-a017-4f1a-8330-24c9eb5224c4/0fed25d6-899d-49c5-89b8-238658cec1be/interactive_pages/module-d9a45632-8268-49a8-b3bd-2b56ff358963-u1"

  # By user_id, lesson_id, module_id:
  python pull_from_supabase.py --user 2202c52b-a017-4f1a-8330-24c9eb5224c4 --lesson 0fed25d6-899d-49c5-89b8-238658cec1be --module module-d9a45632-8268-49a8-b3bd-2b56ff358963-u1

  # Output directory (default: repo root, so files go to modules/<module_id>/):
  python pull_from_supabase.py "<prefix>" --out /path/to/GeminiLoop

Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
"""

import os
import sys
from pathlib import Path

# Default bucket and path layout (must match rp_handler)
BUCKET = "lesson_assets"
INTERACTIVE_PAGES = "interactive_pages"


def _collect_files(client, bucket: str, prefix: str, files: list[str]) -> None:
    """Recursively list and collect all file paths under prefix."""
    try:
        resp = client.storage.from_(bucket).list(prefix, {"limit": 500})
    except Exception as e:
        print(f"List {prefix}: {e}", file=sys.stderr)
        return
    for item in resp:
        name = item.get("name")
        if not name:
            continue
        path = f"{prefix}/{name}" if prefix else name
        # If listing this path returns children, it's a folder
        try:
            sub = client.storage.from_(bucket).list(path, {"limit": 1})
            if sub and len(sub) > 0:
                _collect_files(client, bucket, path, files)
                continue
        except Exception:
            pass
        files.append(path)


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Pull interactive_pages module from Supabase Storage")
    ap.add_argument("prefix", nargs="?", help="Storage prefix (user_id/lesson_id/interactive_pages/module_id)")
    ap.add_argument("--user", "-u", help="user_id (use with --lesson and --module)")
    ap.add_argument("--lesson", "-l", help="lesson_id")
    ap.add_argument("--module", "-m", help="module_id (e.g. module-d9a45632-...-u1)")
    ap.add_argument("--out", "-o", default=".", help="Output directory (default: current dir)")
    args = ap.parse_args()

    if args.prefix:
        storage_prefix = args.prefix.strip().rstrip("/")
        if storage_prefix.startswith("lesson_assets/"):
            storage_prefix = storage_prefix.split("/", 1)[1]
        parts = storage_prefix.split("/")
        if len(parts) >= 4 and parts[-3] == INTERACTIVE_PAGES:
            module_id = parts[-1]
        else:
            module_id = parts[-1] if parts else "unknown"
    elif args.user and args.lesson and args.module:
        storage_prefix = f"{args.user}/{args.lesson}/{INTERACTIVE_PAGES}/{args.module}"
        module_id = args.module
    else:
        ap.error("Provide either prefix or --user, --lesson, and --module")

    url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/") + "/"
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or url == "/" or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY", file=sys.stderr)
        sys.exit(1)

    try:
        from supabase import create_client
    except ImportError:
        print("pip install supabase", file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)
    files: list[str] = []
    _collect_files(client, BUCKET, storage_prefix, files)

    if not files:
        print("No files found under that prefix.", file=sys.stderr)
        sys.exit(1)

    out_root = Path(args.out).resolve()
    module_dir = out_root / "modules" / module_id
    module_dir.mkdir(parents=True, exist_ok=True)

    # storage_prefix is user/lesson/interactive_pages/module_id; rel path = after that
    prefix_parts = len(storage_prefix.split("/"))

    for path in files:
        try:
            data = client.storage.from_(BUCKET).download(path)
        except Exception as e:
            print(f"Download {path}: {e}", file=sys.stderr)
            continue
        parts = path.split("/")
        rel = "/".join(parts[prefix_parts:]) if len(parts) > prefix_parts else path
        local = module_dir / rel
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(data)
        print(local.relative_to(out_root))

    print(f"Done. Module: {module_dir}")
    print(f"  View: python serve.py && open http://localhost:8000/index.html?module={module_id}")


if __name__ == "__main__":
    main()
