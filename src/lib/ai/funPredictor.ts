// AI Fun Fight Predictor
import { Fighter, Fight, FunFactor, FunFactorType } from '@/types'

export class FunFightPredictor {
  private modelWeights = {
    finishRate: 0.3,
    stylistic: 0.25,
    popularity: 0.15,
    stakes: 0.2,
    historical: 0.1
  }

  // Main prediction function
  async predictFightFun(fighter1: Fighter, fighter2: Fighter, fight: Fight): Promise<{
    score: number
    factors: FunFactor[]
    description: string
  }> {
    const factors = await this.analyzeFunFactors(fighter1, fighter2, fight)
    const score = this.calculateOverallScore(factors)
    const description = await this.generateAIDescription(fighter1, fighter2, factors, score)

    return {
      score,
      factors,
      description
    }
  }

  // Analyze various fun factors
  private async analyzeFunFactors(fighter1: Fighter, fighter2: Fighter, fight: Fight): Promise<FunFactor[]> {
    const factors: FunFactor[] = []

    // 1. Finish Rate Analysis
    const avgFinishRate = (fighter1.stats.finishRate + fighter2.stats.finishRate) / 2
    if (avgFinishRate > 70) {
      factors.push({
        type: 'high_finish_rate',
        score: Math.min(avgFinishRate, 100),
        description: `Both fighters have high finish rates (${avgFinishRate.toFixed(1)}% average)`,
        weight: this.modelWeights.finishRate
      })
    }

    // 2. Stylistic Matchup
    const stylisticScore = this.analyzeStyleMatchup(fighter1, fighter2)
    factors.push({
      type: 'striker_vs_striker', // This would be dynamic based on actual styles
      score: stylisticScore,
      description: this.getStyleMatchupDescription(fighter1, fighter2),
      weight: this.modelWeights.stylistic
    })

    // 3. Fan Favorites
    const popularityScore = this.analyzePopularity(fighter1, fighter2)
    if (popularityScore > 60) {
      factors.push({
        type: 'fan_favorites',
        score: popularityScore,
        description: `High fan interest with combined social following of ${(fighter1.popularity.socialFollowers + fighter2.popularity.socialFollowers).toLocaleString()}`,
        weight: this.modelWeights.popularity
      })
    }

    // 4. Title Implications
    if (fight.titleFight) {
      factors.push({
        type: 'title_implications',
        score: 95,
        description: 'Championship fight with title on the line',
        weight: this.modelWeights.stakes
      })
    } else if (fight.mainEvent) {
      factors.push({
        type: 'title_implications',
        score: 80,
        description: 'Main event with significant implications',
        weight: this.modelWeights.stakes
      })
    }

    // 5. Skill Level Parity
    const skillParity = this.analyzeSkillParity(fighter1, fighter2)
    if (skillParity > 70) {
      factors.push({
        type: 'similar_skill_level',
        score: skillParity,
        description: 'Evenly matched fighters with similar skill levels',
        weight: this.modelWeights.historical
      })
    }

    // 6. Aggressive Fighting Styles
    const aggressionScore = this.analyzeAggression(fighter1, fighter2)
    if (aggressionScore > 75) {
      factors.push({
        type: 'aggressive_styles',
        score: aggressionScore,
        description: 'Both fighters known for aggressive, forward-pressure styles',
        weight: this.modelWeights.stylistic
      })
    }

    return factors
  }

  private analyzeStyleMatchup(fighter1: Fighter, fighter2: Fighter): number {
    // Simplified style analysis
    const f1Striker = fighter1.fighting_style?.includes('striking') || false
    const f2Striker = fighter2.fighting_style?.includes('striking') || false
    const f1Grappler = fighter1.fighting_style?.includes('grappling') || false
    const f2Grappler = fighter2.fighting_style?.includes('grappling') || false

    if (f1Striker && f2Striker) return 85 // Striking battle
    if ((f1Striker && f2Grappler) || (f1Grappler && f2Striker)) return 75 // Mixed styles
    if (f1Grappler && f2Grappler) return 60 // Grappling heavy

    return 65 // Unknown/mixed styles
  }

  private getStyleMatchupDescription(fighter1: Fighter, fighter2: Fighter): string {
    const f1Style = fighter1.fighting_style?.[0] || 'mixed'
    const f2Style = fighter2.fighting_style?.[0] || 'mixed'

    return `${f1Style} vs ${f2Style} stylistic matchup`
  }

  private analyzePopularity(fighter1: Fighter, fighter2: Fighter): number {
    const totalFollowers = fighter1.popularity.socialFollowers + fighter2.popularity.socialFollowers
    const avgBuzz = (fighter1.popularity.recentBuzzScore + fighter2.popularity.recentBuzzScore) / 2
    const fanFavorites = (fighter1.popularity.fanFavorite ? 20 : 0) + (fighter2.popularity.fanFavorite ? 20 : 0)

    // Normalize social following (assuming 1M+ followers = 50 points)
    const followersScore = Math.min((totalFollowers / 1000000) * 25, 50)

    return Math.min(followersScore + avgBuzz/2 + fanFavorites, 100)
  }

  private analyzeSkillParity(fighter1: Fighter, fighter2: Fighter): number {
    // Simple parity calculation based on records and stats
    const f1WinRate = fighter1.record.wins / (fighter1.record.wins + fighter1.record.losses) || 0
    const f2WinRate = fighter2.record.wins / (fighter2.record.wins + fighter2.record.losses) || 0

    const winRateDiff = Math.abs(f1WinRate - f2WinRate)
    return Math.max(0, 100 - (winRateDiff * 200)) // Closer records = higher score
  }

  private analyzeAggression(fighter1: Fighter, fighter2: Fighter): number {
    // Based on striking stats and finish rates
    const f1Aggression = (fighter1.stats.significantStrikesPerMinute * 10) + fighter1.stats.finishRate
    const f2Aggression = (fighter2.stats.significantStrikesPerMinute * 10) + fighter2.stats.finishRate

    return Math.min((f1Aggression + f2Aggression) / 2, 100)
  }

  private calculateOverallScore(factors: FunFactor[]): number {
    if (factors.length === 0) return 50 // Default neutral score

    let totalWeightedScore = 0
    let totalWeight = 0

    factors.forEach(factor => {
      totalWeightedScore += factor.score * factor.weight
      totalWeight += factor.weight
    })

    return Math.min(Math.max(totalWeightedScore / totalWeight, 0), 100)
  }

  // Generate AI description using the factors
  private async generateAIDescription(
    fighter1: Fighter,
    fighter2: Fighter,
    factors: FunFactor[],
    score: number
  ): Promise<string> {
    // In a real implementation, this would call OpenAI or another LLM
    // For now, generate a template-based description

    const excitement = score > 80 ? 'extremely exciting' :
                      score > 70 ? 'highly entertaining' :
                      score > 60 ? 'solid entertainment' : 'potentially slow'

    const topFactor = factors.reduce((prev, current) =>
      (prev.score * prev.weight) > (current.score * current.weight) ? prev : current
    )

    const descriptions = {
      high_finish_rate: "This fight promises fireworks with both fighters known for finishing opponents.",
      striker_vs_striker: "Expect a striking showcase with both fighters preferring to stand and bang.",
      fan_favorites: "High fan interest ensures an electric atmosphere for this crowd-pleasing matchup.",
      title_implications: "Championship stakes always elevate the intensity and drama.",
      similar_skill_level: "Evenly matched opponents often produce the most competitive and exciting fights.",
      aggressive_styles: "Two aggressive fighters colliding usually means non-stop action."
    }

    const factorDescription = descriptions[topFactor.type] || "This matchup has interesting dynamics."

    return `This ${excitement} fight features ${fighter1.name} vs ${fighter2.name}. ${factorDescription} With a fun score of ${score.toFixed(1)}/100, ${score > 70 ? "this is a must-watch bout" : "this fight has decent entertainment potential"}.`
  }
}

// Utility function to get mock AI description (placeholder for OpenAI integration)
export async function generateOpenAIDescription(
  fighter1: Fighter,
  fighter2: Fighter,
  funScore: number,
  factors: FunFactor[]
): Promise<string> {
  // This would integrate with OpenAI API
  // For now, return a mock response

  const prompt = `Analyze this UFC fight and explain why it received a fun score of ${funScore}/100:

  Fighter 1: ${fighter1.name} (${fighter1.record.wins}-${fighter1.record.losses}-${fighter1.record.draws})
  Finish Rate: ${fighter1.stats.finishRate}%

  Fighter 2: ${fighter2.name} (${fighter2.record.wins}-${fighter2.record.losses}-${fighter2.record.draws})
  Finish Rate: ${fighter2.stats.finishRate}%

  Key Factors: ${factors.map(f => f.description).join(', ')}

  Write a 2-3 sentence analysis of why this fight will be entertaining.`

  // Mock response - in production, this would call OpenAI
  return `This matchup between ${fighter1.name} and ${fighter2.name} promises excellent entertainment value. The combination of their high finish rates and complementary fighting styles creates a recipe for an action-packed bout that should keep fans on the edge of their seats.`
}