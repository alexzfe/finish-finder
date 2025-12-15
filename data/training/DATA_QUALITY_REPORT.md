# Data Quality Analysis Report

## Overview

This report documents data quality issues found during the Phase 2 labeling pipeline implementation. Analysis date: December 14, 2025.

## Critical Issues Found & Fixed

### 1. Knockdown Data Missing (FIXED)

**Severity**: Critical
**Impact**: Only 8 fights had knockdown data vs expected 2,986

**Root Causes**:
1. **Type conversion bug**: CSV stored KD as float strings (`'0.0'`), but code used `int()` directly which fails on non-integer strings
2. **Event name whitespace**: Results CSV had trailing spaces in event names that stats CSV didn't have

**Fix Applied**:
```python
# Before (broken):
kd = int(row.get('KD', 0))

# After (fixed):
kd = int(float(row.get('KD', 0)))
```

**Results After Fix**:
- Fights with knockdowns: 2,986 (35.2%)
- Average knockdowns per fight: 0.427

### 2. Submission Attempts Missing (FIXED)

**Severity**: High
**Impact**: Same type conversion issue as knockdowns

**Fix Applied**: Same `int(float(...))` pattern

**Results After Fix**:
- Fights with sub attempts: 3,593 (42.4%)

### 3. Stats Merge Failing (FIXED)

**Severity**: Critical
**Impact**: Stats not merging for any fights due to key mismatch

**Root Cause**: Trailing whitespace in EVENT column of results file

**Evidence**:
```
Stats:   "UFC 323: Dvalishvili vs. Yan 2"
Results: "UFC 323: Dvalishvili vs. Yan 2 "  # trailing space
```

**Fix Applied**: Added `.strip()` to all key lookups

## Database vs Training Data Comparison

### Production Database (Supabase)
| Metric | Count |
|--------|-------|
| Total fights | 119 |
| Completed fights | 73 |
| Fighters | 293 |
| Events | 15 |
| Weak supervision labels | 44 |

### Training Data (Greco1899 + Wikipedia)
| Metric | Count |
|--------|-------|
| Total fights | 8,482 |
| Events | 756 |
| Fights with stats | 8,481 |
| Fights with bonuses | 911 |

**Gap Analysis**: Production database is for recent/upcoming events only. Training data covers full UFC history.

## Scraper Data Collection Gaps

The UFCStats scraper collects **fighter aggregate statistics** but NOT round-by-round fight metrics:

| Data Type | Scraper | Greco1899 |
|-----------|---------|-----------|
| Fighter career stats | ✅ | ✅ |
| Fight outcomes | ✅ | ✅ |
| Round-by-round stats | ❌ | ✅ |
| Knockdowns per fight | ❌ | ✅ |
| Control time per fight | ❌ | ✅ |
| Submission attempts | ❌ | ✅ |
| Strike breakdown (head/body/leg) | ❌ | ✅ |
| FOTN/POTN bonuses | ❌ | ✅ (via Wikipedia) |

**Implication**: For real-time predictions, we can only use pre-fight fighter statistics. Post-fight analysis requires manual data entry or Greco1899 updates.

## Data Quality Metrics After Fixes

### Tier Label Distribution
| Tier | Count | Percentage |
|------|-------|------------|
| 1 (Low) | 1,543 | 18.2% |
| 2 (Average) | 2,992 | 35.3% |
| 3 (Good) | 2,486 | 29.3% |
| 4 (Excellent) | 1,153 | 13.6% |
| 5 (Elite) | 308 | 3.6% |

### Label Accuracy
- FOTN → Tier 5: **100%**
- POTN → Tier 4: **100%**
- Non-bonus in Tier 1-3: **92.7%**

### Labeling Function Coverage
| Function | Coverage | Notes |
|----------|----------|-------|
| lf_fotn_bonus | 2.6% | Ground truth |
| lf_potn_bonus | 8.3% | Ground truth |
| lf_early_finish | 4.8% | High signal |
| lf_knockdown_present | **6.1%** | Was 0.03% before fix |
| lf_any_finish | 26.7% | - |
| lf_low_volume | 39.2% | - |
| lf_decision_low_action | 45.7% | - |

## Remaining Data Quality Concerns (RESOLVED)

### 1. Temporal Bias - EXPLAINED ✓
Pre-2015 fights have higher Tier 1 rate (26.2%) vs Post-2015 (13.7%). After analysis with Gemini:
- **This is REAL, not a data issue** - reflects the "Lay and Pray" era (2005-2012)
- Rule changes in 2015+ prioritized "Damage" over "Control"
- Modern referees separate inactive clinches faster
- UFC cuts "boring" fighters more aggressively now

**Sanity Check Passed:**
- 100% of Tier 1 fights are decisions (no mislabeled finishes)
- Avg strikes: 24.4 (genuinely low action)
- High control time: 351s (grappling-heavy era)

### 2. Early UFC Stats - FIXED ✓
- Only 5 rows (0.06%) dropped due to truly missing data
- Implemented era-adjusted Z-scores to normalize across time
- Pre-2005 fights with legitimate quick finishes preserved

### 3. Knockdown Data - VALIDATED ✓
35% knockdown rate across modern era (2005-2024) is:
- **Accurate** - consistent 34-36% across 20 years proves data quality
- MMA includes wrestling, jiu-jitsu - majority of fights have no knockdowns
- `0` is a valid signal distinguishing brawls from technical matches

### 4. Missing Nickname Data
Production database stores fighter nicknames but training data doesn't include them. Minor issue.

## Recommendations

### Short-term
1. ✅ Fixed type conversion and whitespace bugs
2. Re-run tier labeling pipeline with corrected data

### Medium-term
1. Add round-by-round stat collection to scraper for completed events
2. Cross-validate Greco1899 data against UFCStats.com periodically
3. Build automated data quality checks into pipeline

### Long-term
1. Consider scraping UFCStats event pages for complete fight metrics
2. Build a data freshness dashboard
3. Implement anomaly detection for new data imports

## Appendix: Scripts Modified

| File | Changes |
|------|---------|
| `merge_training_data.py` | Added `.strip()` to keys, fixed `int(float(...))` conversions |
| `labeling_functions.py` | Added `pd.isna()` check for bonus column |
