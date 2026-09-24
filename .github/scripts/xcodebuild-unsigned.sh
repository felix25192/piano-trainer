#!/usr/bin/env bash
# Builds the iOS shell without signing, for one destination, and reports
# compiler errors where they can be read without logging in: as annotations
# and in the run's summary.
set -uo pipefail

destination="$1"
name="$2"
log="build/$name.log"
mkdir -p build

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "$destination" \
  -derivedDataPath "build/$name" \
  CODE_SIGNING_ALLOWED=NO \
  build > "$log" 2>&1
status=$?

if [ $status -eq 0 ]; then
  echo "- $name build succeeded." >> "$GITHUB_STEP_SUMMARY"
  grep -E "warning: .*(MidiBridge|midi-bridge)" "$log" | sort -u | head -20 | sed 's/^/  - /' >> "$GITHUB_STEP_SUMMARY" || true
  exit 0
fi

echo "### $name build failed" >> "$GITHUB_STEP_SUMMARY"
echo '```' >> "$GITHUB_STEP_SUMMARY"
grep -E "error:|fatal|BUILD FAILED" "$log" | sort -u | head -40 >> "$GITHUB_STEP_SUMMARY"
echo '```' >> "$GITHUB_STEP_SUMMARY"
grep -E "error:" "$log" | sort -u | head -10 | while read -r line; do
  echo "::error::$line"
done
tail -60 "$log"
exit $status
