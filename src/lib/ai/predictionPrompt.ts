interface PredictionPromptFight {
  id: string
  fighter1Name: string
  fighter2Name: string
  weightClass: string
  cardPosition?: string
}

export function buildPredictionPrompt(eventName: string, fights: PredictionPromptFight[]): string {
  const fightList = fights
    .map(f => `${f.id}: ${f.fighter1Name} vs ${f.fighter2Name} (${f.weightClass}) - ${f.cardPosition ?? 'unknown'}`)
    .join('\n')

  return `You are a senior MMA analyst whose specialty is identifying bouts that will thrill fans. Prioritize finish probability above all else when assigning the funFactor: a high likelihood of a KO/TKO or submission should heavily influence the score, while other excitement boosters (pace, chaos, rivalries, stakes) can nudge it up or down but never override finish potential. Analyze the following upcoming UFC fights and respond with strict JSON only.\n\nGuidelines:\n- Keep analysis fight-specific; you may mention event context (e.g., title or main event) only as supporting detail.\n- Return the fights in the exact order they are provided.\n- riskLevel reflects how unpredictable the outcome is, not your confidence in the prediction.\n- If critical fighter data is missing, output "insufficient data" in entertainmentReason and set funFactor and finishProbability to 0; otherwise provide your best informed assessment and never leave fields blank.\n\nEVENT: ${eventName}\n\nFor each fight, provide:\n- fightId\n- funFactor (1-10 entertainment scale driven primarily by finish probability)\n- finishProbability (0-100)\n- entertainmentReason (3-4 sentences detailing why this fight will or will not deliver action, citing specific stylistic dynamics, recent performances, and volatility)\n- keyFactors (3-5 short phrases such as "knockout power" or "scramble heavy")\n- prediction (succinct outcome pick)\n- riskLevel (high|medium|low)\n\nFIGHTS TO ANALYZE:\n${fightList}`
}
