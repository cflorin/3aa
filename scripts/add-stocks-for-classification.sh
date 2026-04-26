#!/bin/bash
# EPIC-005/STORY-083: Add 12 stocks via API, wait for completion, then classify
# Usage: ./scripts/add-stocks-for-classification.sh

SESSION="611b80dd-d1c5-4551-a0ed-e845eca794ad"
BASE="http://localhost:3001"
TICKERS=("NVDA" "AAPL" "MSFT" "AMZN" "AVGO" "GOOG" "META" "TSLA" "BRK.B" "JPM" "LLY" "XOM")
LOG_DIR="/tmp/stock-add-logs"
mkdir -p "$LOG_DIR"

add_stock() {
  local TICKER=$1
  local LOG="$LOG_DIR/${TICKER}.log"
  echo "[$(date +%H:%M:%S)] Adding $TICKER..."

  # Stream SSE, capture final status
  curl -s -N \
    -H "Cookie: sessionId=$SESSION" \
    -H "Content-Type: application/json" \
    -d "{\"ticker\":\"$TICKER\"}" \
    -X POST \
    "$BASE/api/universe/stocks" > "$LOG" 2>&1

  local EXIT=$?
  if grep -q '"stage":"done"' "$LOG"; then
    echo "[$(date +%H:%M:%S)] ✅ $TICKER done"
  elif grep -q '"stage":"error"' "$LOG"; then
    local ERR=$(grep '"stage":"error"' "$LOG" | head -1)
    echo "[$(date +%H:%M:%S)] ❌ $TICKER error: $ERR"
  elif grep -q '"error"' "$LOG"; then
    echo "[$(date +%H:%M:%S)] ❌ $TICKER HTTP error: $(cat $LOG | head -2)"
  else
    echo "[$(date +%H:%M:%S)] ⚠️  $TICKER status unknown — see $LOG"
  fi
}

echo "Adding ${#TICKERS[@]} stocks to universe..."
echo "Logs in: $LOG_DIR"
echo ""

# Add in batches of 3 (LLM enrichment is rate-limited)
BATCH_SIZE=3
for ((i=0; i<${#TICKERS[@]}; i+=BATCH_SIZE)); do
  BATCH=("${TICKERS[@]:$i:$BATCH_SIZE}")
  echo "--- Batch: ${BATCH[*]} ---"
  pids=()
  for T in "${BATCH[@]}"; do
    add_stock "$T" &
    pids+=($!)
    sleep 1  # stagger slightly to avoid simultaneous LLM calls
  done
  # Wait for this batch before starting next
  for pid in "${pids[@]}"; do
    wait $pid
  done
  echo ""
done

echo "All stocks processed."
