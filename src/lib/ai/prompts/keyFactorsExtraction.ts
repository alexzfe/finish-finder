/**
 * Key Factors Extraction Prompts
 *
 * Two-Step Chain approach (Solution 2 from docs/ai-context/key-factors-generation.md):
 * - Step 1: Generate analysis (main prediction prompts)
 * - Step 2: Extract key factors from reasoning text using focused extraction prompt
 *
 * This approach provides 95-99% reliability vs 80-95% for single-step prompts.
 */

/**
 * Build prompt to extract key factors from finish probability reasoning
 *
 * @param reasoning - The finalAssessment text from finish probability prediction
 * @returns Extraction prompt for LLM
 */
export function buildFinishKeyFactorsExtractionPrompt(reasoning: string): string {
  return `You are a text summarization expert. Extract the 1-2 most critical key factors from the following MMA fight finish probability analysis.

RULES:
- Each factor must be 1-2 words only (e.g., "Weak Chin", "High Volume", "Durability")
- Focus on the MOST IMPORTANT factors driving the finish prediction
- Output only a valid JSON array of strings
- Do not add any other text, explanation, or markdown

ANALYSIS TEXT:
"""
${reasoning}
"""

JSON OUTPUT (array of 1-2 strings):`
}

/**
 * Build prompt to extract key factors from fun score reasoning
 *
 * @param reasoning - The reasoning text from fun score breakdown
 * @returns Extraction prompt for LLM
 */
export function buildFunKeyFactorsExtractionPrompt(reasoning: string): string {
  return `You are a text summarization expert. Extract the 2-3 most critical key factors from the following MMA fight entertainment analysis.

RULES:
- Each factor must be 1-2 words only (e.g., "High Pace", "Striker Battle", "Title Fight")
- Focus on the MOST IMPORTANT factors driving the fun score
- Output only a valid JSON array of strings
- Do not add any other text, explanation, or markdown

ANALYSIS TEXT:
"""
${reasoning}
"""

JSON OUTPUT (array of 2-3 strings):`
}
