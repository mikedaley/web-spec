#!/bin/bash
#
# run-tests.sh - Build and run native test suites
#
# Usage:
#   ./tests/run-tests.sh          # Run all tests
#   ./tests/run-tests.sh z80      # Run Z80 CPU tests only
#   ./tests/run-tests.sh timing   # Run timing tests only
#   ./tests/run-tests.sh disk     # Run disk compatibility tests
#   ./tests/run-tests.sh disk /path/to/dsk/images
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build-native"

# Build
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"
cmake "$PROJECT_DIR" > /dev/null 2>&1
make -j$(sysctl -n hw.ncpu) 2>&1 | grep -E "^(\[|Linking|error:|warning:.*timing_test|warning:.*z80_test)" || true

# Run
DISK_DIR="${2:-$PROJECT_DIR/tests/disk/images}"

case "${1:-all}" in
    z80)
        ./z80_test
        ;;
    timing)
        ./timing_test
        ;;
    disk)
        ./disk_test "$DISK_DIR"
        ;;
    all)
        ./z80_test
        echo ""
        ./timing_test
        echo ""
        if [ -d "$DISK_DIR" ] && [ "$(ls -A "$DISK_DIR"/*.dsk 2>/dev/null)" ]; then
            ./disk_test "$DISK_DIR"
        else
            echo "Disk tests skipped (no images in $DISK_DIR)"
        fi
        ;;
    *)
        echo "Usage: $0 [z80|timing|disk|all] [disk-image-dir]"
        exit 1
        ;;
esac
