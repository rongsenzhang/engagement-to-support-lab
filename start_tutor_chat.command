#!/bin/sh
# macOS Finder opens .command launchers in Terminal.
cd "$(dirname "$0")" || exit 1
exec python3 run_demo.py --chat --port 0
