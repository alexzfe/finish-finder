# DSPy Prompt Optimization

This directory contains tools for automatically optimizing MMA prediction prompts using [DSPy](https://github.com/stanfordnlp/dspy).

## Overview

DSPy optimizes prompts by:
1. Defining prediction tasks as "signatures" (input → output)
2. Running optimization to find the best few-shot examples
3. Exporting optimized prompts for use in production

## Quick Start

```bash
# 1. Generate evaluation data from historical fights
cd /home/alex/projects/finish-finder
DATABASE_URL="..." OPENAI_API_KEY="..." npx ts-node scripts/generate-dspy-eval-data.ts --limit 100

# 2. Run DSPy optimization
source scripts/dspy-optimization/.venv/bin/activate
OPENAI_API_KEY="..." python scripts/dspy-optimization/optimize_prompts.py \
  --data data/dspy/eval_data_dspy.json \
  --output data/dspy/optimized \
  --max-demos 4

# 3. Review optimized prompts
cat data/dspy/optimized/optimized_finish_prompt.json
cat data/dspy/optimized/optimized_fun_prompt.json
```

## Monthly Optimization Workflow

### When to Run
- After accumulating 50+ new completed fights
- After major model updates (GPT-4o, Claude version changes)
- When prediction accuracy drops noticeably

### Step-by-Step Process

1. **Generate fresh evaluation data**
   ```bash
   DATABASE_URL="postgresql://..." \
   OPENAI_API_KEY="..." \
   npx ts-node scripts/generate-dspy-eval-data.ts --limit 200
   ```
   This uses historical fights with known outcomes. Cost: ~$2-5 for 200 fights.

2. **Run DSPy optimization**
   ```bash
   source scripts/dspy-optimization/.venv/bin/activate
   OPENAI_API_KEY="..." python scripts/dspy-optimization/optimize_prompts.py \
     --data /path/to/eval_data_dspy.json \
     --output /path/to/optimized \
     --max-demos 4
   ```
   Cost: ~$0.50-1.00 with gpt-4o-mini.

3. **Review the optimized demos**

   Check `data/dspy/optimized/optimized_finish_prompt.json`:
   - Do the examples cover low/medium/high probability cases?
   - Is the reasoning clear and follows the 4-step framework?
   - Did predictions match actual outcomes?

4. **Update TypeScript prompts (if demos are better)**

   Copy good examples to `src/lib/ai/prompts/anchorExamples.ts`:
   ```typescript
   export const FINISH_PROBABILITY_ANCHORS = [
     {
       fighter1: "...",
       fighter2: "...",
       reasoning: "...",
       probability: 0.85,
     },
     // ... more examples
   ];
   ```

5. **Test the updated prompts**
   ```bash
   npm run test:run -- --grep "prediction"
   ```

## Files

| File | Purpose |
|------|---------|
| `optimize_prompts.py` | Main DSPy optimization script |
| `requirements.txt` | Python dependencies |
| `.venv/` | Python virtual environment |

## Output Format

### optimized_finish_prompt.json
```json
{
  "signature": "Predict the probability that an MMA fight ends in a finish...",
  "demos": [
    {
      "fighter1_context": "Fighter A profile...",
      "fighter2_context": "Fighter B profile...",
      "weight_class": "Lightweight Bout",
      "reasoning": "4-step analysis...",
      "finish_probability": 0.75,
      "actual_finish": 1
    }
  ]
}
```

### optimized_fun_prompt.json
```json
{
  "signature": "Predict how entertaining an MMA fight will be...",
  "demos": [
    {
      "fighter1_context": "...",
      "fighter2_context": "...",
      "weight_class": "...",
      "reasoning": "...",
      "fun_score": 85,
      "actual_finish": 1
    }
  ]
}
```

## Cost Estimates

| Step | Cost (gpt-4o-mini) | Cost (gpt-4o) |
|------|-------------------|---------------|
| Generate 100 eval data points | ~$1.50 | ~$7.50 |
| Generate 200 eval data points | ~$3.00 | ~$15.00 |
| DSPy optimization (30 examples) | ~$0.50 | ~$2.50 |
| **Total (monthly)** | **~$3-5** | **~$10-20** |

## Troubleshooting

### "DSPy not installed"
```bash
cd scripts/dspy-optimization
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### "Data file not found"
Use absolute paths when running from project root:
```bash
python scripts/dspy-optimization/optimize_prompts.py \
  --data $(pwd)/data/dspy/eval_data_dspy.json \
  --output $(pwd)/data/dspy/optimized
```

### Empty demos exported
The script will auto-generate demos from training data if extraction fails.
Check that the prediction service is working correctly.
