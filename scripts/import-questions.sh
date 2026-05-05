#!/bin/bash
# Usage: ./scripts/import-questions.sh <token> [api_url] [questions_dir]
# Example: ./scripts/import-questions.sh eyJ... http://localhost:3000 /path/to/extracted
# Note: import passages first before running this script

TOKEN=$1
API=${2:-http://localhost:3000}
DIR=${3:-sample}

if [ -z "$TOKEN" ]; then
  echo "Usage: $0 <token> [api_url] [questions_dir]"
  exit 1
fi

# Exclude *_passages.jsonl files
files=()
for f in "$DIR"/*.jsonl; do
  [[ "$f" == *_passages.jsonl ]] && continue
  [ -e "$f" ] && files+=("$f")
done

if [ ${#files[@]} -eq 0 ]; then
  echo "No question .jsonl files found in $DIR"
  exit 1
fi

args=()
for f in "${files[@]}"; do
  args+=(-F "files=@$f")
  echo "Queuing: $f"
done

echo ""
curl -X POST "$API/api/admin/questions/import-jsonl" \
  -H "Authorization: Bearer $TOKEN" \
  "${args[@]}" | jq .
