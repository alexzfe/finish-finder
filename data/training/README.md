# MMA Entertainment Prediction Training Data

This directory contains the training data and scripts for the UFC fight entertainment prediction model.

## Phase 1: Data Foundation - COMPLETE ✓

### Data Sources

| File | Records | Description |
|------|---------|-------------|
| `ufc_event_details.csv` | 756 | UFC event information (name, date, location) |
| `ufc_fight_results.csv` | 8,482 | Fight outcomes (method, round, time) |
| `ufc_fight_stats.csv` | ~40,000 | Round-by-round statistics |
| `ufc_fighter_details.csv` | 4,451 | Fighter biographical info |
| `ufc_fighter_tott.csv` | 4,451 | Tale of the tape data |
| `ufc_bonuses.csv` | 1,193 | FOTN/POTN bonus data (Wikipedia) |

### Processed Datasets

| File | Records | Description |
|------|---------|-------------|
| `training_data.csv` | 8,482 | Merged fight data with bonus labels |
| `normalized_training_data.csv` | 8,477 | Era-normalized data with Z-scores and implied bonuses |
| `labeled_training_data.csv` | 8,482 | Training data with deterministic tier assignments |
| `snorkel_labeled_data.csv` | 8,477 | Training data with probabilistic tier labels |
| `tier_thresholds.json` | - | Calibrated thresholds from analysis |
| `label_matrix.npy` | 8,477×12 | Labeling function output matrix |
| `tier_probabilities.npy` | 8,477×5 | Probability distribution over tiers |
| `lf_weights.npy` | 12 | Learned labeling function weights |

### Scripts

| Script | Purpose |
|--------|---------|
| `scrape_wikipedia_bonuses.py` | Scrapes FOTN/POTN bonuses from Wikipedia |
| `merge_training_data.py` | Merges fight data with bonus labels |
| `analyze_distributions.py` | Analyzes statistics to determine thresholds |
| `generate_tier_labels.py` | Applies deterministic tier labeling |

## Phase 2: Labeling Pipeline - COMPLETE ✓

### Data Normalization

Era-adjusted normalization to fix temporal bias in historical data:

| Feature | Purpose |
|---------|---------|
| `total_sig_strikes_z` | Era-adjusted Z-score for strike volume |
| `total_knockdowns_z` | Era-adjusted Z-score for knockdowns |
| `total_sub_attempts_z` | Era-adjusted Z-score for submission attempts |
| `implied_bonus` | Synthetic bonus for pre-2014 exciting fights |
| `era` | Categorical: Pioneer, DarkAges, Growth, PreUSADA, Modern, Current |

### Labeling Functions (12 LFs)

| LF | Description | Coverage | Signal |
|----|-------------|----------|--------|
| `lf_fotn_bonus` | FOTN bonus → Tier 5 | 2.6% | High |
| `lf_potn_bonus` | POTN/KOTN/SOTN → Tier 4 | 8.3% | High |
| `lf_implied_bonus` | Implied bonus (pre-2014) → Tier 4 | 4.2% | High |
| `lf_early_finish` | Round 1 finish → Tier 4-5 | 4.8% | High |
| `lf_high_volume_competitive` | >150 strikes (absolute) → Tier 3-4 | 9.9% | Medium |
| `lf_high_volume_zscore` | Top 10% volume (era-adjusted) → Tier 3-4 | 8.7% | Medium |
| `lf_finish_with_action` | Finish + >80 strikes → Tier 3-4 | 5.7% | Medium |
| `lf_any_finish` | Any finish → Tier 3 | 26.7% | Medium |
| `lf_knockdown_present` | Multiple knockdowns → Tier 3+ | 6.1% | Medium |
| `lf_low_volume` | <60 strikes → Tier 1-2 | 39.2% | Medium |
| `lf_one_sided_grappling` | High control + low strikes → Tier 1 | 37.6% | Medium |
| `lf_decision_low_action` | Decision + <100 strikes → Tier 2 | 45.7% | Medium |

### Label Model

Hierarchical aggregation with priority ordering:
1. FOTN → Tier 5 (100% accuracy)
2. POTN/KOTN/SOTN → Tier 4 (100% accuracy)
3. Early dramatic finish → Tier 4-5
4. Finish with action → Tier 3-4
5. Any finish → Tier 3
6. High volume → Tier 3
7. Low volume/grappling heavy → Tier 1-2

### Validation Results

- **Bonus fight accuracy**: 100% (FOTN→T5, POTN→T4)
- **Non-bonus fights in T1-3**: 92.7%
- **Agreement with deterministic**: 91.5% exact, 99.0% within ±1
- **High confidence labels**: 49.3%
- **Labeling function coverage**: 89.6%

### Scripts

| Script | Purpose |
|--------|---------|
| `normalize_data.py` | Era-adjusted Z-scores and implied bonus generation |
| `labeling_functions.py` | 12 Snorkel-style labeling functions |
| `train_label_model.py` | Trains hierarchical label aggregation |
| `validate_labels.py` | Comprehensive label quality validation |

## Tier System

Based on empirical analysis of 8,482 UFC fights:

| Tier | Name | Criteria | Distribution |
|------|------|----------|--------------|
| 5 | Elite | FOTN bonus | 1.3% (114 fights) |
| 4 | Excellent | POTN bonus OR high-action finish (>100 strikes) | 9.3% (792 fights) |
| 3 | Good | Any finish OR very high volume (>153 strikes) | 32.8% (2,782 fights) |
| 2 | Average | Moderate activity (61-153 strikes) | 31.4% (2,663 fights) |
| 1 | Low | Low activity (<61 strikes) | 25.1% (2,131 fights) |

## Key Statistics

- **Total fights**: 8,482
- **Finish rate**: 32.6%
- **Bonus fights**: 561 (6.6%)
  - FOTN: 114 fights
  - POTN: 447 fights
- **Bonus fight finish rate**: 57.4%
- **Non-bonus fight finish rate**: 30.9%

### Thresholds (from data analysis)

```json
{
  "low_volume": 28,        // 25th percentile
  "medium_volume": 61,     // 50th percentile (median)
  "high_volume": 104,      // 75th percentile
  "very_high_volume": 153, // 90th percentile
  "competitive_diff_max": 30,
  "one_sided_diff_min": 50
}
```

## Key Findings

1. **Strikes per minute is key**: Bonus fights average 9.9 str/min vs 7.5 for non-bonus
2. **Bonus fights are shorter**: Median 385s vs 882s (often end early via finish)
3. **POTN = finishes**: 65.3% finish rate for POTN fights
4. **FOTN = back-and-forth**: 26.3% finish rate (awarded for exciting battles)

## Phase 3: Model Training - COMPLETE ✓

### Feature Engineering

44 pre-fight features calculated from historical fight data:

| Category | Features | Examples |
|----------|----------|----------|
| Fighter 1 Career | 15 | win_rate, finish_rate, sig_str_per_round, kd_per_round |
| Fighter 2 Career | 15 | Same as F1 |
| Physical | 4 | height, reach for both fighters |
| Matchup | 7 | combined_finish_rate, experience_diff, reach_diff |
| Context | 3 | weight_class_baseline, is_title_fight, scheduled_rounds |

### Temporal Splits

| Split | Years | Fights |
|-------|-------|--------|
| Train | < 2023 | 5,053 |
| Validation | 2023 | 405 |
| Test | 2024+ | 859 |

### Model Performance (Test Set)

| Metric | Target | Achieved |
|--------|--------|----------|
| Tier Accuracy | >50% | 41.4% |
| Within ±1 Tier | >85% | 67.1% |
| ECE (5 bins) | <0.10 | **0.045** ✓ |
| Log Loss | - | 1.35 |

### Top Feature Importance

1. `is_title_fight` (11.8%)
2. `scheduled_rounds` (8.8%)
3. `combined_sig_str_per_round` (3.8%)
4. `f1_career_sig_str_per_round` (3.5%)
5. `combined_kd_per_round` (3.1%)

### Bonus Fight Validation

- Bonus fights average predicted tier: 2.73
- Non-bonus fights average: 2.63
- Correct directional correlation

### Model Files

| File | Description |
|------|-------------|
| `fight_features.csv` | 8,477 fights with 44 features |
| `tier_model_xgboost.joblib` | Trained XGBoost classifier |
| `tier_model_calibrated.joblib` | Calibrated model (Platt scaling) |
| `model_features.txt` | Feature column names |

### Scripts

| Script | Purpose |
|--------|---------|
| `feature_engineering.py` | Build pre-fight features from historical data |
| `train_tier_model.py` | Train and evaluate tier classifier |

### Observations

Entertainment prediction from pre-fight features has inherent limitations:
- What happens IN the fight (knockdowns, pace, momentum shifts) determines entertainment
- Pre-fight features can only capture fighter tendencies, not actual fight dynamics
- Model correctly identifies higher-tier probabilities for bonus fights
- Calibration is excellent (ECE 0.045) - probabilities are trustworthy

## Phase 4: Integration - COMPLETE ✓

### Integration Approach

The ML tier model is integrated with the LLM-based prediction pipeline as a calibration/validation signal:

1. **ML tiers computed at scrape time** - Pre-computed for all fights based on fighter statistics
2. **Stored in database** - `mlTier`, `mlTierConfidence`, `mlTierProbabilities` fields in Fight model
3. **Used for LLM validation** - Compare LLM predictions against ML baseline
4. **Ensemble scoring** - Optionally blend LLM and ML predictions for improved calibration

### New Database Fields (Fight model)

| Field | Type | Description |
|-------|------|-------------|
| `mlTier` | Int | 1-5 tier prediction |
| `mlTierConfidence` | Float | Model confidence (0-1) |
| `mlTierProbabilities` | JSON | Array of 5 probabilities |
| `mlTierComputedAt` | DateTime | When tier was computed |

### Integration Functions

| Function | Purpose |
|----------|---------|
| `calculateAllScoresWithML()` | Score calculation with ML validation |
| `comparePredictions()` | Compare LLM and ML predictions |
| `calculateEnsembleScore()` | Blend LLM and ML scores |
| `explainScoreCalculationWithML()` | Debug explanation with ML validation |

### Validation Logic

| Agreement | LLM/ML Difference | Confidence Adjustment |
|-----------|-------------------|----------------------|
| Strong | Within expected range, <10 diff | +15% |
| Moderate | Within range, 10-20 diff | +5% |
| Weak | Outside range, <20 diff | 0% |
| Disagree | >20 diff | -15% to -30% |

### Flagging Rules

Fights are flagged for review when:
- LLM and ML strongly disagree AND ML confidence > 40%
- Fun score difference > 30 points from tier expectation

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/compute-ml-tiers.py` | Batch compute ML tiers for fights |
| `scripts/test-ml-tier-integration.ts` | End-to-end integration test |
| `data/training/export_model_json.py` | Export model for potential JS inference |

### TypeScript Modules

| Module | Purpose |
|--------|---------|
| `src/lib/ai/mlTierIntegration.ts` | ML tier integration logic |
| `src/lib/ai/scoreCalculator.ts` | Updated with ML validation |

## Data Quality

See `DATA_QUALITY_REPORT.md` for detailed analysis of data issues found and fixed.

### Key Fixes Applied
- **Knockdown data**: Fixed type conversion bug (8 → 2,986 fights with KD data)
- **Stats merge**: Fixed whitespace mismatch in event names
- **Submission attempts**: Fixed type conversion (same pattern)

### Current Data Quality Metrics
- Labeling function coverage: 89.6%
- Bonus fight accuracy: 100%
- High-confidence labels: 49.3%

## Data Freshness

- **Greco1899 data**: Updated November 22, 2025
- **Wikipedia bonuses**: Scraped December 14, 2025 (296 events with bonuses)
- **Data quality fixes**: December 14, 2025
