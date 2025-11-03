# AI Key Factors Generation Strategies

## Overview

The AI prediction system generates `keyFactors` - concise 1-2 word labels that summarize the most important factors driving predictions. These are displayed as bubble tags in the UI, separate from the detailed analysis text.

**Requirements:**
- **Finish Probability**: Generate 1-2 key factors
- **Fun Score**: Generate 2-3 key factors
- Each factor should be 1-2 words (e.g., "High Pace", "Finish Rate", "Durability")
- Factors must be extracted from the reasoning, not pre-defined
- Must work reliably across OpenAI GPT-4 and Anthropic Claude

## Current Implementation: Solution 1 (Process-Oriented Prompts)

**Status**: Active
**Reliability**: Good (recommended by Gemini as first approach)

### How It Works

The prompts use a numbered INSTRUCTIONS section that creates a cognitive workflow:

```
INSTRUCTIONS:
1. Perform a detailed analysis of the fight, considering all relevant factors
2. Populate the 'reasoning' object with your step-by-step analysis
3. After writing your 'finalAssessment', review it carefully and identify the 1-2 most critical concepts
4. Summarize these concepts into concise 1-2 word labels for the 'keyFactors' array
5. Construct the final JSON object, ensuring all fields are populated
```

### JSON Schema

Uses abstract placeholders instead of concrete examples to avoid bias:

```json
{
  "keyFactors": [
    "<A concise, 1-2 word summary of the most important factor from the reasoning>",
    "<A concise, 1-2 word summary of the second most important factor>"
  ]
}
```

### Why This Works

- **Cognitive Workflow**: Numbered instructions create a clear, sequential workflow
- **Self-Reflection**: Instruction to "review" its own text encourages meta-awareness
- **Abstract Placeholders**: Describes *properties* of good factors without providing concrete examples
- **No Bias**: Avoids anchoring the model to specific terms

### Files

- `src/lib/ai/prompts/finishProbabilityPrompt.ts` - Lines 116-121
- `src/lib/ai/prompts/funScorePrompt.ts` - Lines 188-193

---

## Fallback Solution 2: Two-Step Chain (Analyze, then Extract)

**Status**: Not implemented (fallback if Solution 1 fails)
**Reliability**: Extremely reliable
**Trade-off**: Increased latency and complexity (2 API calls)

### How It Works

Separate the tasks into two distinct LLM calls:

**Step 1: Generate the Analysis**
- Prompt the model to perform full analysis and generate JSON
- **Completely omit** the `keyFactors` field from the schema
- Output: JSON with `finishProbability`, `confidence`, and `reasoning`

**Step 2: Extract the Key Factors**
- Take the `finalAssessment` text from Step 1
- Use a second, focused prompt with a simpler, faster model (GPT-3.5-Turbo or Claude Haiku)

```
You are a text summarization expert. From the following analysis, extract the 1-2 most critical key factors that led to the conclusion. Each factor must be 1-2 words.

RULES:
- Output only a valid JSON array of strings
- Do not add any other text or explanation

ANALYSIS TEXT:
"""
{finalAssessment_text_from_step_1}
"""

JSON OUTPUT:
```

- Output: JSON array like `["Finishing Power", "Pace Issues"]`
- Merge Step 1 and Step 2 results into final object

### Implementation Pseudocode

```typescript
// Step 1: Generate analysis
const analysisPrompt = buildFinishProbabilityPrompt(input); // No keyFactors in schema
const analysisResponse = await callLLM(analysisPrompt);
const analysis = JSON.parse(analysisResponse.text);

// Step 2: Extract key factors
const extractionPrompt = `
You are a text summarization expert. From the following analysis, extract the 1-2 most critical key factors. Each factor must be 1-2 words.

ANALYSIS: ${analysis.reasoning.finalAssessment}

Output only a JSON array: ["factor1", "factor2"]
`;
const extractionResponse = await callFastLLM(extractionPrompt); // Use cheaper model
const keyFactors = JSON.parse(extractionResponse.text);

// Merge results
const finalPrediction = {
  ...analysis,
  keyFactors
};
```

### When to Use

- If Solution 1 shows <90% reliability in generating keyFactors
- For production systems requiring near-100% reliability
- When cost of second API call is acceptable (~$0.0001-0.0003 per extraction)

---

## Fallback Solution 3: Tool-Calling / Function-Calling APIs

**Status**: Not implemented (most robust fallback)
**Reliability**: Highest (near 100%)
**Trade-off**: Requires code changes, API-specific

### How It Works

Use OpenAI/Anthropic function-calling APIs where you define your desired JSON as a formal "tool" schema. Models are heavily optimized to populate these schemas correctly.

The key is to use the `description` fields within the schema as your instructions.

### OpenAI Implementation

```typescript
import OpenAI from 'openai';
const client = new OpenAI();

const response = await client.chat.completions.create({
  model: "gpt-4",
  messages: [{
    role: "user",
    content: "Analyze the finish probability for Pereira vs. Hill"
  }],
  functions: [{
    name: "record_fight_prediction",
    description: "Records the analysis and key factors for a UFC fight prediction",
    parameters: {
      type: "object",
      properties: {
        finishProbability: {
          type: "number",
          description: "The predicted probability of a finish, from 0.0 to 1.0"
        },
        reasoning: {
          type: "object",
          description: "The detailed chain-of-thought analysis",
          properties: {
            finalAssessment: {
              type: "string",
              description: "Final summary of the reasoning"
            }
          }
        },
        keyFactors: {
          type: "array",
          description: "A list of 1-2 concise (1-2 word) key factors. These MUST be derived from the most critical points in the 'finalAssessment' reasoning.",
          items: { type: "string" }
        }
      },
      required: ["finishProbability", "reasoning", "keyFactors"]
    }
  }],
  function_call: { name: "record_fight_prediction" }
});

const prediction = JSON.parse(response.choices[0].message.function_call.arguments);
```

### Anthropic Implementation

```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-3-opus-20240229",
  max_tokens: 4096,
  messages: [{
    role: "user",
    content: "Analyze the finish probability for Pereira vs. Hill"
  }],
  tools: [{
    name: "record_fight_prediction",
    description: "Records the analysis and key factors for a UFC fight prediction",
    input_schema: {
      type: "object",
      properties: {
        finishProbability: {
          type: "number",
          description: "The predicted probability of a finish, from 0.0 to 1.0"
        },
        reasoning: {
          type: "object",
          description: "The detailed chain-of-thought analysis",
          properties: {
            finalAssessment: {
              type: "string",
              description: "Final summary of the reasoning"
            }
          }
        },
        keyFactors: {
          type: "array",
          description: "A list of 1-2 concise (1-2 word) key factors. These MUST be derived from the most critical points in the 'finalAssessment' reasoning.",
          items: { type: "string" }
        }
      },
      required: ["finishProbability", "reasoning", "keyFactors"]
    }
  }],
  tool_choice: { type: "tool", name: "record_fight_prediction" }
});

const toolUse = response.content.find(block => block.type === 'tool_use');
const prediction = toolUse.input;
```

### Why This Works

- **High Reliability**: Model treats filling the schema as its primary goal
- **Required Fields**: The `required` keyword ensures fields aren't omitted
- **Targeted Instructions**: The `description` for `keyFactors` provides precise, in-place instructions
- **Modern Best Practice**: This is the canonical way to get structured output from LLMs

### When to Use

- For production systems requiring maximum reliability (near 100%)
- When willing to refactor prediction service code
- Most future-proof solution as APIs continue to improve tool-calling support

### Implementation Notes

- Requires changes to `src/lib/ai/newPredictionService.ts`
- Would replace `buildFinishProbabilityPrompt()` and `buildFunScorePrompt()` with tool schemas
- Both OpenAI and Anthropic support this (with slightly different APIs)
- Cost is similar to current approach

---

## Decision Matrix

| Solution | Reliability | Latency | Cost | Complexity | Status |
|----------|-------------|---------|------|------------|--------|
| **Solution 1: Process Prompts** | Good (80-95%) | Low (1 call) | $0.01-0.02/fight | Low | ✅ Active |
| **Solution 2: Two-Step Chain** | Excellent (95-99%) | Medium (2 calls) | $0.012-0.023/fight | Medium | 🔄 Fallback |
| **Solution 3: Tool-Calling** | Excellent (99-100%) | Low (1 call) | $0.01-0.02/fight | Medium-High | 🔄 Fallback |

---

## Recommendation

1. **Start with Solution 1** (current implementation) - Simplest and likely sufficient
2. **Monitor keyFactors generation rate** in production
3. **If <90% reliability**, migrate to **Solution 3** (Tool-Calling) for best long-term solution
4. **Use Solution 2** only as temporary fallback if Solution 3 implementation is blocked

---

## Testing Key Factors Generation

To verify keyFactors are being generated:

```bash
# Run single prediction
DATABASE_URL="..." AI_PROVIDER=openai \
  npx ts-node scripts/new-ai-predictions-runner.ts --limit 1 --force --no-web-search

# Check output in database
DATABASE_URL="..." node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const pred = await prisma.prediction.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  const finish = JSON.parse(pred.finishReasoning);
  const fun = JSON.parse(pred.funBreakdown);
  console.log('Finish keyFactors:', finish.keyFactors);
  console.log('Fun keyFactors:', fun.keyFactors);
  await prisma.\$disconnect();
})();
"
```

Expected output:
```
Finish keyFactors: ['Durability', 'Finish Rate']
Fun keyFactors: ['High Pace', 'Striker Battle', 'Decision Risk']
```

---

## References

- Gemini Consultation Session: `4621991c-9cbd-4055-8d70-acfacce3e823`
- Commit: `4ecc2dc` (Process-oriented prompts implementation)
- Related Files:
  - `src/lib/ai/prompts/finishProbabilityPrompt.ts`
  - `src/lib/ai/prompts/funScorePrompt.ts`
  - `src/lib/ai/newPredictionService.ts`
  - `src/app/api/db-events/route.ts` (keyFactors extraction logic)
