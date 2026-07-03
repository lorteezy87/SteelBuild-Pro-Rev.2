#!/bin/bash
# Fires after any Write/Edit. If the touched file is numberSequencing.jsx
# (or a file that imports it), guard the known regression and run any related
# tests. Exit 2 surfaces a blocking message back to the agent.

# Read the hook payload once. Prefer jq; fall back to node (always present in
# this Node project) so the guard still works on machines without jq installed.
INPUT=$(cat)
if command -v jq >/dev/null 2>&1; then
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
else
  FILE_PATH=$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).tool_input?.file_path??""))}catch{process.stdout.write("")}})')
fi

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

if echo "$FILE_PATH" | grep -qi "numberSequencing"; then
  # Guard against the known regression: deriving the next sequence number
  # client-side (e.g. Math.max over existing records) INSTEAD OF the atomic DB
  # RPC. Math.max on its own is legitimate here (a self-heal floor); the real
  # regression is Math.max present while the get_next_sequence_number RPC call
  # has been removed. Only block on that combination.
  if grep -qE "Math\.max\(" "$FILE_PATH" 2>/dev/null \
     && ! grep -q "get_next_sequence_number" "$FILE_PATH" 2>/dev/null; then
    echo "BLOCKED: $FILE_PATH derives a sequence number client-side (Math.max) but no longer calls the get_next_sequence_number RPC. Sequence numbers must come from the atomic DB RPC only." >&2
    exit 2
  fi

  echo "numberSequencing touched — running any related tests..." >&2
  # --passWithNoTests: a missing suite must not hard-block the edit; if a
  # numberSequencing test is added later it will run and can block on failure.
  npm run test -- numberSequencing --passWithNoTests --silent
  if [[ $? -ne 0 ]]; then
    echo "BLOCKED: numberSequencing tests failed after edit." >&2
    exit 2
  fi
fi

exit 0
