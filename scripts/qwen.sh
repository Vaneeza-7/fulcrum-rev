#!/bin/bash
# ============================================
# qwen.sh — Quick wrapper for local LLM coding tasks
#
# Usage:
#   ./scripts/qwen.sh edit <file> "<what to do>"
#   ./scripts/qwen.sh new <file> "<what to create>"
#   ./scripts/qwen.sh test <file>
#   ./scripts/qwen.sh review <file>
#   ./scripts/qwen.sh ask "<question about codebase>"
#
# Examples:
#   ./scripts/qwen.sh edit lib/icm/commission-tracker.ts "add quarterly cap logic"
#   ./scripts/qwen.sh new lib/analytics/mixpanel-connector.ts "Mixpanel analytics connector following factory pattern"
#   ./scripts/qwen.sh test lib/content/evs-calculator.ts
#   ./scripts/qwen.sh review lib/huck/agent.ts
# ============================================

set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo /Users/joereed/fulcrum-rev)"

MODEL="${QWEN_MODEL:-qwen:7b}"
CONTEXT_FILE="scripts/CONTEXT.md"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 {edit|new|test|review|ask} <file|question> [task]" >&2
  exit 1
fi

CMD="$1"
shift

CONTEXT=$(cat "$CONTEXT_FILE" 2>/dev/null || echo "No context file found")

case "$CMD" in
  edit)
    FILE="$1"
    TASK="${2:?Provide a task description}"
    if [[ ! -f "$FILE" ]]; then
      echo "File not found: $FILE" >&2
      exit 1
    fi
    CONTENT=$(cat "$FILE")
    RELPATH="$FILE"

    # Grab local type imports (small files only)
    DEPS=""
    for imp in $(grep -oP '(?<=from ")[^"]+(?=")' "$FILE" 2>/dev/null | grep -E '^\./|^\.\./' | head -3); do
      DIR=$(dirname "$FILE")
      for ext in ".ts" "/index.ts"; do
        CANDIDATE="$DIR/$imp$ext"
        if [[ -f "$CANDIDATE" && $(wc -l < "$CANDIDATE") -lt 80 ]]; then
          DEPS="$DEPS
--- $(basename "$CANDIDATE") ---
$(cat "$CANDIDATE")
"
          break
        fi
      done
    done

    PROMPT="$CONTEXT

=== FILE: $RELPATH ===
$CONTENT
$DEPS
=== TASK: $TASK ===
Output the complete modified file. No markdown fences. No explanations. Just the code."
    ;;

  new)
    FILE="$1"
    TASK="${2:?Provide a description of what to create}"
    DIR=$(dirname "$FILE")

    # Check sibling files for style reference
    SIBLING=""
    if [[ -d "$DIR" ]]; then
      NEAREST=$(find "$DIR" -maxdepth 1 -name "*.ts" -not -name "index.ts" | head -1)
      if [[ -n "$NEAREST" && -f "$NEAREST" ]]; then
        SIBLING="
=== STYLE REFERENCE (sibling file): $(basename "$NEAREST") ===
$(head -60 "$NEAREST")
..."
      fi
    fi

    PROMPT="$CONTEXT
$SIBLING
=== CREATE NEW FILE: $FILE ===
$TASK

Output the complete file. No markdown fences. No explanations. Just the code.
Follow the project conventions from the context above."
    ;;

  test)
    FILE="$1"
    if [[ ! -f "$FILE" ]]; then
      echo "File not found: $FILE" >&2
      exit 1
    fi
    CONTENT=$(cat "$FILE")
    RELPATH="$FILE"

    # Check for existing tests
    TEST_DIR="$(dirname "$FILE")/__tests__"
    BASE=$(basename "$FILE" .ts)
    EXISTING_TESTS=""
    for candidate in "$TEST_DIR/${BASE}.test.ts" "$TEST_DIR/${BASE}.test.tsx" "__tests__/${BASE}.test.ts"; do
      if [[ -f "$candidate" ]]; then
        EXISTING_TESTS="
=== EXISTING TESTS: $candidate ===
$(cat "$candidate")"
        break
      fi
    done

    PROMPT="$CONTEXT

=== SOURCE FILE: $RELPATH ===
$CONTENT
$EXISTING_TESTS
=== TASK ===
Write comprehensive vitest tests for this file.
Use vi.mock() for DB (Prisma) and external dependencies.
Cover happy paths, edge cases, and error conditions.
Output the complete test file. No explanations."
    ;;

  review)
    FILE="$1"
    if [[ ! -f "$FILE" ]]; then
      echo "File not found: $FILE" >&2
      exit 1
    fi
    CONTENT=$(cat "$FILE")

    PROMPT="$CONTEXT

=== FILE TO REVIEW: $FILE ===
$CONTENT

=== TASK ===
Review this code for:
1. Bugs or logic errors
2. Security issues (injection, auth bypass, tenant data leaks)
3. Missing error handling
4. Performance concerns
5. TypeScript type safety gaps

Be concise. List findings as: [SEVERITY] description. Only report real issues."
    ;;

  ask)
    QUESTION="$*"

    # Grab the schema for context
    SCHEMA=$(head -120 prisma/schema.prisma 2>/dev/null || echo "")

    PROMPT="$CONTEXT

=== SCHEMA (first 120 lines) ===
$SCHEMA

=== QUESTION ===
$QUESTION

Be concise and specific."
    ;;

  *)
    echo "Unknown command: $CMD" >&2
    echo "Usage: $0 {edit|new|test|review|ask} <file|question> [task]" >&2
    exit 1
    ;;
esac

# Run through ollama API (avoids ANSI spinner garbage)
ESCAPED_PROMPT=$(echo "$PROMPT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')

# Estimate token count: ~4 chars per token
CHAR_COUNT=$(echo "$PROMPT" | wc -c | tr -d ' ')
EST_TOKENS=$((CHAR_COUNT / 4))
# Use 2x prompt tokens for context, min 4096, max 32768
NUM_CTX=$((EST_TOKENS * 2))
NUM_CTX=$((NUM_CTX < 4096 ? 4096 : NUM_CTX))
NUM_CTX=$((NUM_CTX > 32768 ? 32768 : NUM_CTX))

echo "[$MODEL] ~${EST_TOKENS} input tokens, ctx=${NUM_CTX}. Generating..." >&2

RESPONSE=$(curl -s http://localhost:11434/api/generate \
  -d "{\"model\": \"$MODEL\", \"prompt\": $ESCAPED_PROMPT, \"stream\": false, \"options\": {\"temperature\": 0.3, \"num_ctx\": $NUM_CTX}}")

echo "$RESPONSE" | python3 -c 'import sys,json; r=json.loads(sys.stdin.read()); print(r.get("response","ERROR: "+str(r)))'
