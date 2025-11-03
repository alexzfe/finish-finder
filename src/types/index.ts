// Core types for the Finish Finder app

export interface Fighter {
  id: string;
  name: string;
  nickname?: string;
  record: {
    wins: number;
    losses: number;
    draws: number;
  };
  stats: {
    finishRate: number;
    koPercentage: number;
    submissionPercentage: number;
    averageFightTime: number; // in seconds
    significantStrikesPerMinute: number;
    takedownAccuracy: number;
  };
  popularity: {
    socialFollowers: number;
    recentBuzzScore: number; // 0-100
    fanFavorite: boolean;
  };
  funScore: number; // Accumulated fun score from past fights
  weightClass: WeightClass;
  fighting_style: string[];
  imageUrl?: string;
  lastFightDate?: Date;
}

export interface Fight {
  id: string;
  fighter1: Fighter;
  fighter2: Fighter;
  weightClass: WeightClass;
  titleFight: boolean;
  mainEvent: boolean;
  cardPosition?: 'main' | 'preliminary' | 'early-preliminary';
  fightNumber?: number;
  event: UFCEvent;
  predictedFunScore: number; // 0-100
  funFactors: Array<FunFactor | string>;
  aiDescription: string;
  funReasoning?: string; // Fun score analysis text from AI
  funFactor?: number; // Raw 1-10 scale from AI predictions
  finishProbability?: number;
  riskLevel?: 'high' | 'medium' | 'low' | null;
  fightPrediction?: string;
  prediction?: string;
  entertainmentReason?: string;
  scheduledRounds?: number;
  bookingDate: Date;
  completed: boolean;
  actualFunScore?: number; // Post-fight rating
}

export interface UFCEvent {
  id: string;
  name: string;
  date: Date;
  location: string;
  venue: string;
  fightCard: Fight[];
  mainCard: Fight[];
  prelimCard: Fight[];
  earlyPrelimCard: Fight[];
}

export interface FunFactor {
  type: FunFactorType;
  score: number; // 0-100
  description: string;
  weight: number; // How much this factor influences overall score
}

export type FunFactorType =
  | 'high_finish_rate'
  | 'striker_vs_striker'
  | 'grappler_vs_striker'
  | 'fan_favorites'
  | 'title_implications'
  | 'rivalry'
  | 'comeback_potential'
  | 'similar_skill_level'
  | 'aggressive_styles'
  | 'social_buzz';

export type WeightClass =
  | 'strawweight'
  | 'flyweight'
  | 'bantamweight'
  | 'featherweight'
  | 'lightweight'
  | 'welterweight'
  | 'middleweight'
  | 'light_heavyweight'
  | 'heavyweight'
  | 'womens_strawweight'
  | 'womens_flyweight'
  | 'womens_bantamweight'
  | 'womens_featherweight';

export interface PredictionModel {
  modelVersion: string;
  factors: {
    finishRate: number;
    stylistic: number;
    popularity: number;
    stakes: number;
    historical: number;
  };
  confidence: number; // 0-100
  lastUpdated: Date;
}

export interface FunScoreHistory {
  fightId: string;
  predictedScore: number;
  actualScore: number;
  accuracy: number;
  date: Date;
}
