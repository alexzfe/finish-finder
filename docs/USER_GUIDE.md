# Finish Finder User Guide

Welcome to Finish Finder - your AI-powered UFC fight analysis companion!

---

## What is Finish Finder?

Finish Finder predicts how entertaining upcoming UFC fights will be and the likelihood they'll end in a finish (KO/TKO or submission). Our AI analyzes fighter statistics, fighting styles, and historical data to help you identify the most exciting fights on each card.

---

## Getting Started

### Accessing the App

Visit [finish-finder.vercel.app](https://finish-finder.vercel.app) in any modern web browser.

The app works on:
- Desktop browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Android Chrome)
- Tablet devices

### Home Screen Overview

When you first load Finish Finder, you'll see:

1. **Header** - App branding and navigation
2. **Event Navigation** - Carousel showing upcoming UFC events
3. **Fight List** - Cards for each fight on the selected event
4. **Fight Details Panel** - Detailed analysis (desktop: sidebar, mobile: modal)

---

## Navigating Events

### Using the Event Carousel

The event carousel at the top shows upcoming UFC events:

- **Swipe left/right** (mobile) to navigate between events
- **Click arrows** (desktop) to move between events
- **Click dots** at the bottom to jump to a specific event
- Events are sorted by date (nearest event first)

### Event Information

Each event displays:
- **Event name** (e.g., "UFC 299: O'Malley vs. Vera 2")
- **Date** and time
- **Location** (city, venue)
- **Status badge** - "Completed" for past events

---

## Understanding Fight Cards

### Fight Card Sections

Fights are organized into three sections:

1. **Main Card** - Premium fights (5-6 fights)
2. **Prelims** - Preliminary fights
3. **Early Prelims** - Opening fights

### Fight Card Layout

Each fight card shows:

```
┌─────────────────────────────────────────────┐
│  [Avatar]  Fighter 1 Name  (Record)         │
│            vs                                │
│  [Avatar]  Fighter 2 Name  (Record)         │
├─────────────────────────────────────────────┤
│  Weight Class  |  Rounds  |  Finish: XX%   │
│                            Fun Score: [XX]  │
└─────────────────────────────────────────────┘
```

### Reading Fight Information

| Element | Meaning |
|---------|---------|
| **Fighter Avatar** | Profile image or initials |
| **Record** | Wins-Losses-Draws (e.g., 27-1-0) |
| **Weight Class** | Division (Lightweight, Welterweight, etc.) |
| **Rounds** | 3 rounds (regular) or 5 rounds (main event/title) |
| **Finish %** | Probability the fight ends in KO/TKO/Submission |
| **Fun Score** | Entertainment prediction (0-100 scale) |

---

## Understanding Predictions

### Fun Score (0-100)

The Fun Score predicts how entertaining a fight will be:

| Score | Rating | Color | What to Expect |
|-------|--------|-------|----------------|
| 85+ | Elite | Red | Must-watch, potential Fight of the Night |
| 75-84 | Excellent | Orange | Highly entertaining, action-packed |
| 65-74 | Good | Yellow | Solid entertainment value |
| 50-64 | Average | White | Standard fight, some good moments |
| Below 50 | Low | Gray | May lack action, tactical/grinding style |

### Finish Probability (0-100%)

Predicts likelihood the fight ends before the judges' decision:

| Probability | Meaning |
|-------------|---------|
| 70%+ | High likelihood of finish (KO/TKO/SUB) |
| 50-69% | Toss-up, could go either way |
| 30-49% | More likely to go to decision |
| Below 30% | Very likely to be a decision |

### Risk Level

Overall prediction confidence:

| Level | Meaning |
|-------|---------|
| **Low** | High confidence, consistent signals |
| **Balanced** | Moderate confidence, some uncertainty |
| **High** | Low confidence, unpredictable matchup |

---

## Viewing Fight Details

### On Desktop

Click any fight card to see details in the right sidebar:

- **Fun Score** - Large display with exact score
- **Finish Probability** - Percentage chance of finish
- **Risk Profile** - Prediction confidence level
- **AI Analysis** - Detailed breakdown of the prediction
- **Analyst Pick** - AI's prediction on the winner/outcome

### On Mobile

Tap any fight card to open a full-screen modal with the same information.

Close the modal by:
- Tapping the X button
- Tapping outside the modal
- Swiping down (on some devices)

### AI Analysis Sections

The detailed analysis includes:

1. **Finish Probability Analysis**
   - Why the fight might/might not end early
   - Fighter finishing tendencies
   - Style matchup implications

2. **Fun Score Analysis**
   - Pace and action expectations
   - Skill matchup entertainment value
   - Historical fight patterns

3. **Key Factors**
   - 3-5 decisive elements affecting the prediction
   - Examples: "striking volume", "submission threat", "cardio advantage"

---

## Completed Fights

After an event, completed fights show actual results:

### Win Indicators

- **Green checkmark (✓)** next to the winner's name
- **Method**: How the fight ended (KO/TKO, SUB, DEC)
- **Round**: Which round the fight ended
- **Time**: Exact stoppage time (if applicable)

### Example Completed Fight:

```
✓ Fighter A  (28-1-0)
  vs
  Fighter B  (25-5-0)

Lightweight | 3 Rounds | KO/TKO R2 4:35
```

---

## Tips for Using Finish Finder

### Finding the Best Fights

1. **Sort by Fun Score** - Look for fights with scores 75+
2. **Check Main Events** - Usually have higher stakes and entertainment
3. **Title Fights** - Often action-packed with elite fighters
4. **Style Matchups** - Striker vs. Striker often means fireworks

### Understanding Predictions Better

1. **Consider the Context** - Title fights have different dynamics
2. **Weight Class Matters** - Heavyweights finish more often
3. **Recent Form** - Check fighter records for momentum
4. **Risk Level** - High risk = less predictable = potential upset

### Planning Your Viewing

1. **Main Card Highlights** - Focus on highest Fun Score fights
2. **Sleeper Picks** - High scores in prelims are hidden gems
3. **Skip List** - Low scores might be bathroom break material
4. **Full Experience** - Watch from Early Prelims if multiple high scores

---

## Frequently Asked Questions

### How accurate are the predictions?

Our AI predictions are calibrated using historical UFC data. They're meant as entertainment guides, not betting advice. We track accuracy through:
- Brier Score (calibration metric)
- Fun Score correlation with actual Fight of the Night awards
- Finish prediction accuracy

### How often is data updated?

- **Event data**: Daily at 2 AM UTC
- **AI predictions**: Daily at 1:30 AM UTC
- **Fighter statistics**: Updated when new events are scraped

### Why is a fighter's image missing?

Fighter images are sourced from multiple databases. If an image is missing, we show the fighter's initials instead. This doesn't affect the predictions.

### Can I see historical events?

Yes! Past events are available with their actual results. Navigate through the event carousel to find completed events marked with the "Completed" badge.

### What factors go into the predictions?

Our AI analyzes:
- Fighter striking statistics (volume, accuracy, defense)
- Grappling statistics (takedowns, submissions)
- Finish rates (KO%, submission%)
- Loss methods (durability indicators)
- Fighting styles and how they interact
- Event context (title fight, main event, rivalry)
- Weight class finish rates

### Is this for betting?

Finish Finder is designed for entertainment purposes only. While we use sophisticated AI analysis, MMA is inherently unpredictable. Never bet more than you can afford to lose, and always gamble responsibly.

---

## Keyboard Shortcuts (Desktop)

| Key | Action |
|-----|--------|
| `←` Left Arrow | Previous event |
| `→` Right Arrow | Next event |
| `Escape` | Close modal (if open) |

---

## Mobile Gestures

| Gesture | Action |
|---------|--------|
| Swipe Left | Next event |
| Swipe Right | Previous event |
| Tap fight | Open details modal |
| Tap outside modal | Close modal |

---

## Troubleshooting

### Page Not Loading

1. Check your internet connection
2. Try refreshing the page
3. Clear browser cache
4. Try a different browser

### Data Seems Outdated

- Data updates daily around 2 AM UTC
- Check back after this time for the latest information
- Recently announced fights may take up to 24 hours to appear

### Missing Fight Information

- Very recently announced fights may not have predictions yet
- Predictions are generated after fighter data is available

### App Running Slowly

- Close other browser tabs
- Disable browser extensions
- Try a different browser
- Check if your device has sufficient memory

---

## Contact & Feedback

Have questions or suggestions?

- **GitHub Issues**: Report bugs or request features
- **Email**: Contact the development team

We're constantly improving Finish Finder based on user feedback!

---

## Glossary

| Term | Definition |
|------|------------|
| **KO** | Knockout - fighter loses consciousness |
| **TKO** | Technical Knockout - referee stops fight |
| **SUB** | Submission - fighter taps out |
| **DEC** | Decision - judges score the fight |
| **NC** | No Contest - fight invalidated |
| **FOTN** | Fight of the Night - bonus award |
| **POTN** | Performance of the Night - bonus award |
| **Main Event** | Last fight of the evening |
| **Co-Main** | Second to last fight |
| **Title Fight** | Championship bout |
| **Prelims** | Preliminary card fights |

---

**Enjoy using Finish Finder!** May all your chosen fights be bangers! 🥊
