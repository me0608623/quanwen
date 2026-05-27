#!/bin/bash
set -e
BASE="http://localhost:3001/api/v1"

login() {
  curl -sS -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"000\"}" | python -c "import sys,json;print(json.load(sys.stdin)['token'])"
}

api() {
  local token="$1"; local method="$2"; local path="$3"; local body="${4:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$BASE$path" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$BASE$path" -H "Authorization: Bearer $token"
  fi
}

echo "=== Step 1: Login both users ==="
T1=$(login "user1@quanwen.com")
T2=$(login "user2@quanwen.com")
echo "  user1 token: ${T1:0:30}..."
echo "  user2 token: ${T2:0:30}..."

echo ""
echo "=== Step 2: Create mutual surveys ==="
SURVEY_BODY='{
  "title": "TEST mutual survey",
  "description": "互惠測試",
  "type": "mutual",
  "questions": [
    {"type":"single_choice","title":"你喜歡 A 或 B?","sortOrder":0,"isRequired":true,
     "options":[{"label":"A","sortOrder":0},{"label":"B","sortOrder":1}]},
    {"type":"text","title":"為什麼?","sortOrder":1,"isRequired":false}
  ]
}'
S1=$(api "$T1" POST /surveys "$SURVEY_BODY")
S1_ID=$(echo "$S1" | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  user1 survey id: $S1_ID"
S2=$(api "$T2" POST /surveys "$SURVEY_BODY")
S2_ID=$(echo "$S2" | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "  user2 survey id: $S2_ID"

echo ""
echo "=== Step 3: Publish ==="
api "$T1" POST "/surveys/$S1_ID/publish" "{}"
echo ""
api "$T2" POST "/surveys/$S2_ID/publish" "{}"
echo ""

echo ""
echo "=== Step 4: Both should be waiting ==="
api "$T1" GET /mutual | python -m json.tool

echo ""
echo "=== Step 5: Wait for cron (up to 35s) ==="
for i in $(seq 1 12); do
  sleep 3
  M1=$(api "$T1" GET /mutual)
  ST=$(echo "$M1" | python -c "import sys,json;d=json.load(sys.stdin);print(d[0]['status'] if d else 'NONE')")
  echo "  t+$((i*3))s -> user1 status=$ST"
  if [ "$ST" = "matched" ]; then break; fi
done

if [ "$ST" != "matched" ]; then
  echo "!!! Match did not happen. Aborting."
  exit 1
fi

echo ""
echo "=== Step 6: Both matched ==="
PAIR_ID=$(api "$T1" GET /mutual | python -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "  pair id: $PAIR_ID"

echo ""
echo "=== Step 7: user1 fills user2's survey ==="
DETAIL1=$(api "$T1" GET "/mutual/$PAIR_ID")
ANS1=$(echo "$DETAIL1" | python -c "
import sys, json
d = json.load(sys.stdin)
qs = d['survey']['questions']
print(json.dumps({
  'answers': [
    {'questionId': qs[0]['id'], 'selectedOptionIds': [qs[0]['options'][0]['id']]},
    {'questionId': qs[1]['id'], 'textAnswer': 'A is faster'}
  ]
}))
")
api "$T1" POST "/mutual/$PAIR_ID/submit" "$ANS1"
echo ""

echo ""
echo "=== Step 8: user2 fills user1's survey ==="
DETAIL2=$(api "$T2" GET "/mutual/$PAIR_ID")
ANS2=$(echo "$DETAIL2" | python -c "
import sys, json
d = json.load(sys.stdin)
qs = d['survey']['questions']
print(json.dumps({
  'answers': [
    {'questionId': qs[0]['id'], 'selectedOptionIds': [qs[0]['options'][1]['id']]},
    {'questionId': qs[1]['id'], 'textAnswer': 'I prefer B'}
  ]
}))
")
api "$T2" POST "/mutual/$PAIR_ID/submit" "$ANS2"
echo ""

echo ""
echo "=== Step 9: Final state ==="
FINAL1=$(api "$T1" GET /mutual | python -c "import sys,json;d=json.load(sys.stdin)[0];print(f\"user1 status={d['status']} next={d['nextAction']}\")")
echo "  $FINAL1"
FINAL2=$(api "$T2" GET /mutual | python -c "import sys,json;d=json.load(sys.stdin)[0];print(f\"user2 status={d['status']} next={d['nextAction']}\")")
echo "  $FINAL2"

if echo "$FINAL1$FINAL2" | grep -q "status=both_done.*status=both_done"; then
  echo ""
  echo "✅✅✅ Mutual flow PASSED"
else
  echo ""
  echo "❌ Final status not both_done"
  exit 1
fi
