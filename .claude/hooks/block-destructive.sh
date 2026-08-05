#!/bin/bash
# Blocks destructive shell commands before execution (PreToolUse / Bash).

# Read the hook payload once. Prefer jq; fall back to node (always present in
# this Node project) so the hook still works on machines without jq installed.
INPUT=$(cat)
if command -v jq >/dev/null 2>&1; then
  COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')
else
  COMMAND=$(printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.stdout.write(String(JSON.parse(d).tool_input?.command??""))}catch{process.stdout.write("")}})')
fi

if echo "$COMMAND" | grep -qE 'rm -rf|DROP TABLE|DROP DATABASE|TRUNCATE'; then
  # Emit the deny decision as static JSON (no jq dependency) and exit 0 — the
  # decision object is authoritative for PreToolUse.
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Destructive command blocked by hook. Run manually if intentional."}}'
  exit 0
fi

exit 0
