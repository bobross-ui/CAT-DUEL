#!/bin/bash
# Usage: ./scripts/import-passages.sh <token> [api_url] [passages_dir]
# Example: ./scripts/import-passages.sh eyJ... http://localhost:3000 /path/to/extracted

TOKEN=$1
API=${2:-http://localhost:3000}
DIR=${3:-sample}

if [ -z "$TOKEN" ]; then
  echo "Usage: $0 <token> [api_url] [passages_dir]"
  exit 1
fi

files=("$DIR"/*_passages.jsonl)
if [ ! -e "${files[0]}" ]; then
  echo "No *_passages.jsonl files found in $DIR"
  exit 1
fi

args=()
for f in "${files[@]}"; do
  args+=(-F "files=@$f")
  echo "Queuing: $f"
done

echo ""
curl -X POST "$API/api/admin/passages/import-jsonl" \
  -H "Authorization: Bearer $TOKEN" \
  "${args[@]}" | jq .
