#!/usr/bin/env bash
#
# Live HTTP smoke test for the Phase 7 REST API. Exercises every endpoint
# against a running server (default http://localhost:3000) by kicking off a real
# audit and following it through to the downloadable report.
#
# Usage:  ./scripts/api-smoke.sh [TARGET_URL] [BASE_URL]
#   TARGET_URL  site to audit            (default https://www.covecta.io/)
#   BASE_URL    API base                 (default http://localhost:3000)
#
# Requires: curl, jq. Exits non-zero on the first failed assertion.
set -euo pipefail

TARGET_URL="${1:-https://www.covecta.io/}"
BASE="${2:-http://localhost:3000}"
POLL_TIMEOUT="${POLL_TIMEOUT:-600}"   # seconds to wait for the pipeline to finish

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ── POST /audits — bad URL → 400 ────────────────────────────────────────────
hdr "POST /audits (invalid URL → 400)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/audits" \
  -H 'content-type: application/json' -d '{"url":"not-a-url"}')
[ "$code" = "400" ] && pass "rejected invalid URL ($code)" || fail "expected 400, got $code"

# ── POST /audits — empty body → 400 ─────────────────────────────────────────
hdr "POST /audits (empty body → 400)"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/audits" \
  -H 'content-type: application/json' -d '{}')
[ "$code" = "400" ] && pass "rejected empty body ($code)" || fail "expected 400, got $code"

# ── POST /audits — valid → 202 { id, status } ───────────────────────────────
hdr "POST /audits (valid → 202)"
resp=$(curl -s -w '\n%{http_code}' -X POST "$BASE/audits" \
  -H 'content-type: application/json' -d "{\"url\":\"$TARGET_URL\"}")
code=$(tail -n1 <<<"$resp"); body=$(sed '$d' <<<"$resp")
[ "$code" = "202" ] && pass "accepted ($code)" || fail "expected 202, got $code — $body"
AUDIT_ID=$(jq -r '.id' <<<"$body")
status=$(jq -r '.status' <<<"$body")
[ -n "$AUDIT_ID" ] && [ "$AUDIT_ID" != "null" ] && pass "got audit id $AUDIT_ID" || fail "no id in $body"
[ "$status" = "created" ] && pass "status=created" || fail "status=$status"

# ── GET /audits — list includes the new audit ──────────────────────────────
hdr "GET /audits (paginated list)"
list=$(curl -s "$BASE/audits?limit=200&offset=0")
echo "$list" | jq -e '.items and (.total|type=="number")' >/dev/null \
  && pass "envelope has items[] + total" || fail "bad envelope: $list"
echo "$list" | jq -e --arg id "$AUDIT_ID" '.items[]|select(.id==$id)' >/dev/null \
  && pass "list contains the new audit" || fail "new audit not in list"

# ── GET /audits/:id — poll until pipeline finishes ──────────────────────────
hdr "GET /audits/:id (poll to completion, timeout ${POLL_TIMEOUT}s)"
deadline=$(( $(date +%s) + POLL_TIMEOUT ))
status="?"
while :; do
  detail=$(curl -s "$BASE/audits/$AUDIT_ID")
  status=$(jq -r '.status' <<<"$detail")
  printf '\r  status=%-12s findings=%s    ' "$status" "$(jq -r '.findingsTotal // "-"' <<<"$detail")"
  case "$status" in
    done|failed) echo; break ;;
  esac
  [ "$(date +%s)" -ge "$deadline" ] && { echo; fail "timed out waiting (last status=$status)"; }
  sleep 5
done
[ "$status" = "done" ] && pass "pipeline finished: status=done" || fail "pipeline status=$status — $(jq -c . <<<"$detail")"
echo "$detail" | jq -e '.findingsTotal and .bySeverity and .reportPath' >/dev/null \
  && pass "detail has findingsTotal, bySeverity, reportPath" || fail "detail missing rollups: $detail"
echo "  rollup: $(jq -c '{findingsTotal, bySeverity, reportPath}' <<<"$detail")"

# ── GET /audits/:id — unknown id → 404 ──────────────────────────────────────
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/audits/00000000-0000-0000-0000-000000000000")
[ "$code" = "404" ] && pass "unknown id → 404" || fail "expected 404, got $code"

# ── GET /audits/:id/findings — list + severity filter ───────────────────────
hdr "GET /audits/:id/findings"
f=$(curl -s "$BASE/audits/$AUDIT_ID/findings?limit=200")
echo "$f" | jq -e '.items and (.total|type=="number")' >/dev/null \
  && pass "findings envelope ok (total=$(jq -r .total <<<"$f"))" || fail "bad findings: $f"
hi=$(curl -s "$BASE/audits/$AUDIT_ID/findings?severity=high&limit=200")
echo "$hi" | jq -e 'all(.items[]; .severity=="high")' >/dev/null \
  && pass "severity=high filter returns only high (n=$(jq -r .total <<<"$hi"))" || fail "filter leaked non-high"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/audits/00000000-0000-0000-0000-000000000000/findings")
[ "$code" = "404" ] && pass "findings of unknown audit → 404" || fail "expected 404, got $code"

# ── GET /audits/:id/report — download the .xlsx ─────────────────────────────
hdr "GET /audits/:id/report"
out="/tmp/audit-$AUDIT_ID.xlsx"
# NOTE: curl -w emits no trailing newline; the \n keeps `read` from returning
# non-zero at EOF (which would trip `set -e`).
read -r code ctype < <(curl -s -o "$out" -w '%{http_code} %{content_type}\n' "$BASE/audits/$AUDIT_ID/report")
[ "$code" = "200" ] && pass "report → 200" || fail "expected 200, got $code"
case "$ctype" in
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet*) pass "Content-Type is xlsx" ;;
  *) fail "unexpected content-type: $ctype" ;;
esac
ftype=$(file -b "$out")
case "$ftype" in
  *Excel*|*"Zip archive"*|*OOXML*) pass "downloaded file is a real workbook ($(wc -c <"$out" | tr -d ' ') bytes)" ;;
  *) fail "downloaded file not a workbook: $ftype" ;;
esac
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/audits/00000000-0000-0000-0000-000000000000/report")
[ "$code" = "404" ] && pass "report of unknown audit → 404" || fail "expected 404, got $code"

hdr "ALL ENDPOINT CHECKS PASSED"
echo "audit id:   $AUDIT_ID"
echo "report:     $out"
