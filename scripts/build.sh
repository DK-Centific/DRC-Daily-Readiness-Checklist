#!/usr/bin/env bash
# Copy the static site into dist/. If DRC_FLOW_URL is set, write dist/config.local.json
# so the published page uses the Power Automate flow. Never commit that file.
# The file is JSON data. The page does not run it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dist="$root/dist"

rm -rf "$dist"
mkdir -p "$dist"

cp "$root/index.html" "$root/config.js" "$root/_headers" "$dist/"
cp -R "$root/css" "$root/js" "$root/assets" "$dist/"

flow="$(printf '%s' "${DRC_FLOW_URL:-}" | tr -d '\r')"
flow="${flow#"${flow%%[![:space:]]*}"}"
flow="${flow%"${flow##*[![:space:]]}"}"

if [[ -n "$flow" ]]; then
  flow_json="$(DRC_FLOW_URL="$flow" node -e 'process.stdout.write(JSON.stringify(process.env.DRC_FLOW_URL))')"
  printf '{"backend":"pa","FLOW_URL":%s}\n' "$flow_json" > "$dist/config.local.json"
fi
