#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <label> <title> <report-file>" >&2
  exit 1
fi

label="$1"
title="$2"
report="$3"

gh label create "$label" --color d93f0b --force >/dev/null
existing="$(gh issue list --label "$label" --state open --limit 1 --json number --jq '.[0].number // empty')"

if [[ -s "$report" ]]; then
  if [[ -n "$existing" ]]; then
    gh issue edit "$existing" --body-file "$report"
    echo "Updated issue #$existing."
  else
    gh issue create --title "$title" --label "$label" --body-file "$report"
  fi
elif [[ -n "$existing" ]]; then
  gh issue close "$existing" --comment "The latest check found nothing to report, closing."
else
  echo "Nothing to report."
fi
