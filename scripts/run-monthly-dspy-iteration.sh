#!/bin/bash
# Monthly DSPy Iteration Script
#
# Runs predictions month-by-month, optimizing with DSPy after each month
# so each subsequent month benefits from cumulative learning.
#
# Usage:
#   ./scripts/run-monthly-dspy-iteration.sh
#
# Requires:
#   - DATABASE_URL set
#   - OPENAI_API_KEY set

set -e

YEAR=2024
DATA_DIR="data/dspy/monthly"
OPTIMIZED_DIR="data/dspy/optimized"

mkdir -p "$DATA_DIR"
mkdir -p "$OPTIMIZED_DIR"

echo "═══════════════════════════════════════════════════════════════════"
echo "MONTHLY DSPY ITERATION - $YEAR"
echo "═══════════════════════════════════════════════════════════════════"

# Activate Python venv for DSPy
source scripts/dspy-optimization/.venv/bin/activate

for MONTH in 01 02 03 04 05 06 07 08 09 10 11 12; do
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "MONTH: $YEAR-$MONTH"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Step 1: Generate predictions for this month
    echo ""
    echo "[Step 1] Generating predictions for $YEAR-$MONTH..."
    npx ts-node scripts/generate-dspy-eval-by-month.ts \
        --year $YEAR \
        --month $((10#$MONTH))

    # Step 2: Combine all months so far into cumulative dataset
    echo ""
    echo "[Step 2] Combining data from all months so far..."
    COMBINED_FILE="$DATA_DIR/cumulative_${YEAR}-${MONTH}.json"

    # Use node to combine JSON files
    node -e "
    const fs = require('fs');
    const path = require('path');

    const months = [];
    for (let m = 1; m <= parseInt('$MONTH', 10); m++) {
        const monthStr = m.toString().padStart(2, '0');
        const file = path.join('$DATA_DIR', '${YEAR}-' + monthStr + '_eval.json');
        if (fs.existsSync(file)) {
            const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
            months.push(...data);
        }
    }

    fs.writeFileSync('$COMBINED_FILE', JSON.stringify(months, null, 2));
    console.log('  Combined ' + months.length + ' fights into $COMBINED_FILE');
    "

    # Step 3: Run DSPy optimization on cumulative data
    echo ""
    echo "[Step 3] Running DSPy optimization on cumulative data..."
    python scripts/dspy-optimization/optimize_prompts.py \
        --data "$COMBINED_FILE" \
        --output "$OPTIMIZED_DIR" \
        --max-demos 4

    # Step 4: Show results for this iteration
    echo ""
    echo "[Step 4] Month $YEAR-$MONTH complete!"
    echo "  - Predictions: $DATA_DIR/${YEAR}-${MONTH}_eval.json"
    echo "  - Cumulative: $COMBINED_FILE"
    echo "  - Optimized prompts: $OPTIMIZED_DIR/"

    # Pause between months to avoid rate limits
    echo ""
    echo "Waiting 5 seconds before next month..."
    sleep 5
done

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "ALL MONTHS COMPLETE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Final optimized prompts are in: $OPTIMIZED_DIR/"
echo "Monthly evaluation data is in: $DATA_DIR/"
