# MMA Fight Entertainment Prediction System
## Architecture & Implementation Plan

---

## Executive Summary

Build a prediction model that estimates how entertaining a UFC fight will be, outputting a **Finish Probability (0-100%)** and **Fun Score (1-100)**. The system trains on historical fight data using performance bonuses as primary labels, supplemented by statistical proxies.

**Key architectural decision**: Train on 5 entertainment tiers (not continuous scores), then map to 1-100 display scores using qualitative LLM analysis. This aligns model training with actual label granularity.

---

## Part 1: Data Collection

### 1.1 Data Sources (Priority Order)

| Source | What to Get | Why |
|--------|-------------|-----|
| **Greco1899/scrape_ufc_stats** (GitHub) | 6 pre-built CSVs with fight stats, round-by-round data | Primary dataset, daily updates, 7000+ fights |
| **Wikipedia UFC event pages** | FOTN/POTN bonus winners | Primary training labels |
| **jansen88/ufc-data** (GitHub) | Historical betting odds | Calibration, market-implied probabilities |
| **The Odds API** (free tier) | Current odds for upcoming fights | Inference features |

### 1.2 Data Collection Tasks

```
Task 1: Download Greco1899 CSVs
├── ufc_event_details.csv
├── ufc_fight_details.csv
├── ufc_fight_results.csv
├── ufc_fight_stats.csv
├── ufc_fighter_details.csv
└── ufc_fighter_tott.csv

Task 2: Scrape Wikipedia for bonuses
├── Iterate UFC 1 through current (~320 events)
├── Extract: FOTN, POTN, KOTN (legacy), SOTN (legacy)
├── Rate limit: 1-2 seconds between requests
└── Output: CSV mapping event → bonus winners

Task 3: Merge datasets
├── Join fights with bonus data on event + fighter names
├── Handle name normalization (nicknames, spelling variations)
├── Calculate fight-level aggregates from round-by-round stats
└── Output: Single denormalized fights table with all features + labels
```

### 1.3 Key Fields to Capture

**Fight Outcome Data**
- Winner, method (KO/TKO, SUB, DEC types), round, time
- Weight class, title fight flag, main event flag

**Fight Statistics (both fighters)**
- Significant strikes: landed, attempted, accuracy, by target (head/body/leg)
- Total strikes: landed, attempted
- Knockdowns
- Takedowns: landed, attempted, accuracy
- Submission attempts
- Control time (seconds)

**Bonus Labels**
- FOTN (Fight of the Night) - applies to both fighters
- POTN (Performance of the Night) - applies to individual
- KOTN/SOTN (legacy, pre-2014) - treat as POTN equivalent

**Derived Features**
- Total significant strikes (both fighters combined)
- Strike differential (absolute difference)
- Control time differential
- Is finish (boolean)
- Finish round (null if decision)

---

## Part 2: Entertainment Tier System

### 2.1 Why Tiers Instead of Continuous Scores

| Problem with 0-100 | Solution with Tiers |
|--------------------|---------------------|
| Labels don't have that precision (bonus = "good" not "87") | 5 tiers match actual label granularity |
| Model learns arbitrary numbers in "good" range | Model learns meaningful category boundaries |
| Hard to validate ("is 73 correct?") | Easy to validate ("was this actually tier 4?") |
| False precision | Honest uncertainty |

### 2.2 Tier Definitions

| Tier | Name | Primary Criteria | Secondary Criteria |
|------|------|------------------|-------------------|
| **5** | Elite | FOTN bonus | — |
| **4** | Excellent | POTN bonus | OR: Finish + high volume (>100 sig strikes) |
| **3** | Good | Finish (no bonus) | OR: High volume (>150) + competitive (<30 diff) |
| **2** | Average | Moderate volume (80-150 strikes) | No standout features |
| **1** | Low | Low volume (<80 strikes) | OR: One-sided (>50 diff) + low action |

**Note**: Thresholds (80, 100, 150, 30, 50) should be calibrated from actual data distributions. Run percentile analysis on bonus vs non-bonus fights first.

### 2.3 Labeling Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    LABELING HIERARCHY                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HIGH CONFIDENCE (use directly)                                 │
│  ├── FOTN bonus → Tier 5                                       │
│  ├── POTN bonus → Tier 4                                       │
│  └── Very low stats (bottom 10%) → Tier 1                      │
│                                                                 │
│  MEDIUM CONFIDENCE (labeling functions)                         │
│  ├── Finish + high volume → Tier 4                             │
│  ├── Finish only → Tier 3                                      │
│  ├── High volume + competitive → Tier 3                        │
│  └── Low volume + one-sided → Tier 1                           │
│                                                                 │
│  LOW CONFIDENCE (weak supervision)                              │
│  └── Everything else → Label model assigns probabilistic tier  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Weak Supervision Approach

Use Snorkel-style labeling functions that each vote on tier assignment:

**Labeling Functions to Implement**
1. `lf_fotn_bonus` → Tier 5 (high confidence)
2. `lf_potn_bonus` → Tier 4 (high confidence)
3. `lf_early_finish` (round 1 KO/SUB) → Tier 4-5
4. `lf_high_volume_competitive` (>150 strikes, <30 diff) → Tier 3-4
5. `lf_finish_with_action` (finish + >80 strikes) → Tier 3-4
6. `lf_any_finish` → Tier 3
7. `lf_knockdown_present` → Tier 3+
8. `lf_low_volume` (<60 strikes) → Tier 1-2
9. `lf_one_sided_grappling` (>5min ctrl diff, low strikes) → Tier 1
10. `lf_decision_low_action` (decision + <100 strikes) → Tier 2

**Label Model**
- Train Snorkel LabelModel on labeling function outputs
- Outputs probabilistic tier assignments
- Use confidence threshold (e.g., >0.7) for training data
- Low-confidence fights can be excluded or soft-labeled

---

## Part 3: Prediction Architecture

### 3.1 System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRE-FIGHT FEATURES                         │
│  Fighter A stats, Fighter B stats, matchup context              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TIER CLASSIFICATION MODEL                     │
│  Input: Pre-fight features only (no future leakage)             │
│  Output: Tier probabilities {1: 0.05, 2: 0.15, 3: 0.35, ...}   │
│  Model: Gradient boosting (XGBoost/LightGBM) or neural net     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 LLM QUALITATIVE ANALYSIS                        │
│  Input: Fighter profiles, recent news, style matchup            │
│  Output: pace (1-5), finishDanger (1-5), technicality (1-5),   │
│          styleClash, brawlPotential, confidence                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SCORE MAPPING LAYER                          │
│  Combines: Tier prediction + Tier confidence + LLM ratings     │
│  Output: Finish Probability (0-100%), Fun Score (1-100)        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Feature Engineering (Pre-Fight Only)

**Fighter Career Features** (calculate as-of fight date)
- Win/loss record, finish rate (KO + SUB wins / total wins)
- Significant strikes landed per minute (career average)
- Significant strikes absorbed per minute (vulnerability)
- Striking accuracy and defense percentages
- Takedown offense and defense rates
- Historical FOTN/POTN count (entertainment track record)
- Average fight duration
- Recent form (last 3 fights weighted higher)

**Matchup Features**
- Style clash indicator (striker vs grappler, etc.)
- Combined finish rate (both fighters)
- Combined volume (sig strikes landed/min)
- Experience differential
- Reach/height differential

**Context Features**
- Weight class baseline finish rate
- Title fight flag
- Main event flag
- Card position (main card vs prelims)

### 3.3 Tier-to-Score Mapping

```
TIER RANGES:
  Tier 1 (Low)      → Fun Score 15-35
  Tier 2 (Average)  → Fun Score 35-55
  Tier 3 (Good)     → Fun Score 55-72
  Tier 4 (Excellent)→ Fun Score 72-85
  Tier 5 (Elite)    → Fun Score 85-95

POSITION WITHIN RANGE determined by:
  - LLM qualitative ratings (pace, finishDanger, technicality)
  - Tier confidence from classifier
  - Style clash modifier

FINISH PROBABILITY:
  - Separate prediction head OR derived from tier + finishDanger rating
  - Calibrate using Platt scaling on historical predictions
```

---

## Part 4: Training Pipeline

### 4.1 Data Splits

```
TEMPORAL SPLIT (prevents future leakage):
├── Training:   Fights before 2023
├── Validation: Fights 2023-mid 2024
└── Test:       Fights mid 2024-present

DO NOT use random splits - fighters appear multiple times
```

### 4.2 Training Steps

1. **Threshold Calibration**
   - Analyze bonus vs non-bonus fight statistics
   - Set tier boundary thresholds at empirical percentiles
   - Document threshold rationale

2. **Label Generation**
   - Apply labeling functions to all historical fights
   - Train Snorkel label model
   - Generate probabilistic tier labels
   - Filter to high-confidence labels for initial training

3. **Feature Engineering**
   - Calculate all features using only pre-fight data
   - Critical: For each fight, use fighter stats as-of day before fight
   - Handle missing data (early UFC fights have sparse stats)

4. **Model Training**
   - Train tier classifier (XGBoost recommended for tabular data)
   - Use ordinal regression loss or standard multiclass
   - Cross-validate on temporal folds

5. **Calibration**
   - Apply Platt scaling to tier probabilities
   - Calibrate finish probability separately
   - Validate with reliability diagrams

6. **Mapping Function Tuning**
   - Tune tier-to-score mapping parameters
   - Weight LLM qualitative factors
   - Validate end-to-end on held-out set

### 4.3 Evaluation Metrics

| Metric | Target | What It Measures |
|--------|--------|------------------|
| Tier Accuracy | >50% | Exact tier prediction |
| Tier ±1 Accuracy | >85% | Within one tier |
| Brier Score (finish) | <0.20 | Finish probability calibration |
| ECE (5 bins) | <0.10 | Expected calibration error |
| Correlation with bonuses | >0.4 | High scores → bonus likelihood |

---

## Part 5: Validation Without Labels

### 5.1 Proxy Metrics for Entertainment

Since entertainment is subjective and labels are sparse:

| Proxy | Source | Correlation to Entertainment |
|-------|--------|------------------------------|
| Performance bonus | Wikipedia | Direct (our primary label) |
| Total significant strikes | UFCStats | High volume = more action |
| Knockdowns | UFCStats | High-impact moments |
| Early finish | UFCStats | Usually indicates action |
| Social media mentions | Twitter/Reddit | Fan engagement signal |
| Post-fight interview time | Broadcast | Exciting fights get more coverage |

### 5.2 Ongoing Validation Strategy

1. **Collect user ratings** on your predictions over time
   - Binary: "Was this fight entertaining?" 
   - Simpler than 1-100 rating, higher response rate

2. **Track prediction vs bonus correlation**
   - Fights you scored 80+ should get bonuses more often
   - Fights you scored <40 should rarely get bonuses

3. **Calibration monitoring**
   - Monthly reliability diagrams for finish probability
   - Recalibrate Platt scaling parameters quarterly

4. **A/B test prompt variations**
   - Compare LLM qualitative ratings across prompt versions
   - Measure consistency and correlation with outcomes

---

## Part 6: Implementation Phases

### Phase 1: Data Foundation (Week 1-2)
- [ ] Download Greco1899 datasets
- [ ] Build Wikipedia bonus scraper
- [ ] Create merged dataset with bonus labels
- [ ] Analyze statistical distributions
- [ ] Set tier thresholds from data

### Phase 2: Labeling Pipeline (Week 2-3)
- [ ] Implement labeling functions
- [ ] Train Snorkel label model
- [ ] Generate tier labels for all fights
- [ ] Validate label quality on known fights

### Phase 3: Model Training (Week 3-4)
- [ ] Feature engineering pipeline
- [ ] Train tier classifier
- [ ] Calibrate probabilities
- [ ] Evaluate on held-out test set

### Phase 4: Integration (Week 4-5)
- [ ] Integrate tier model with existing LLM pipeline
- [ ] Implement score mapping layer
- [ ] End-to-end testing
- [ ] Deploy and monitor

### Phase 5: Iteration (Ongoing)
- [ ] Collect user feedback
- [ ] Monthly recalibration
- [ ] Expand training data with new events
- [ ] Refine thresholds and mappings

---

## Appendix: Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Training target | 5 tiers | Matches label granularity |
| Primary labels | FOTN/POTN bonuses | Expert-judged, objective |
| Secondary labels | Statistical proxies | Expand coverage |
| Model type | Gradient boosting | Best for tabular, interpretable |
| Calibration | Platt scaling | Simple, works at small scale |
| Display score | Map from tier + LLM | Provides granularity without false precision |
| Data split | Temporal | Prevents leakage, realistic evaluation |

---

## Appendix: Open Questions for Team Discussion

1. **Threshold tuning**: Should we use percentiles (e.g., 75th) or absolute values for tier boundaries?

2. **Weight class adjustment**: Entertainment expectations differ by weight class (heavyweights finish more). Normalize or keep raw?

3. **Recency weighting**: How much to weight recent fights vs career averages in features?

4. **Label confidence threshold**: What Snorkel confidence cutoff for including fights in training?

5. **User feedback collection**: How to prompt users for ratings without disrupting experience?
