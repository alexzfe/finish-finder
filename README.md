# 🥊 Finish Finder

An AI-powered UFC fight entertainment analyzer that helps fans discover the most exciting upcoming matchups. Built with real-time data scraping from Sherdog and OpenAI-powered analysis, Finish Finder provides entertainment scores, finish probabilities, and detailed breakdowns to help UFC fans prioritize their viewing experience.

## 🌐 Live Demo

**[View Live Site on GitHub Pages →](https://alexzfe.github.io/finish-finder/)**

## ✨ Features

### 🎯 Core Functionality
- **Real UFC Data**: Live scraping from Sherdog for accurate fight cards and fighter information
- **OpenAI Analysis**: GPT-powered entertainment predictions with detailed reasoning
- **Fun Score Rating**: 1-10 scoring system for fight entertainment potential
- **UFC-Style Interface**: Authentic design matching the official UFC website
- **Sticky Fight Details**: Interactive sidebar that follows your scroll with fight breakdowns
- **Finish Probability**: AI-calculated odds of knockouts and submissions
- **Key Factors Analysis**: Breakdown of what makes each fight exciting

### 📊 AI Analysis Factors
- **Striking Power & Aggression**: Knockout artists, heavy hitters, volume strikers
- **Submission Threat**: Grappling specialists and submission artists
- **Fighting Styles Clash**: Striker vs grappler dynamics and counter-fighting
- **Recent Form**: Win streaks, spectacular finishes, and momentum
- **Historical Performance**: Fight of the Night bonuses and finish rates
- **Title Implications**: Championship fights and rankings impact
- **Personal Narratives**: Rivalries, comebacks, and career-defining moments

## 🛠️ Technology Stack

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: UFC-style responsive design
- **React Hooks**: Modern state management

### Backend & AI
- **OpenAI GPT-4**: AI-powered fight analysis and predictions
- **Sherdog Scraper**: Real-time UFC fight card data collection
- **Cheerio**: HTML parsing for web scraping
- **Axios**: HTTP client for data fetching

### Data & Deployment
- **Static JSON**: GitHub Pages compatible data storage
- **GitHub Pages**: Automated deployment pipeline

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- npm package manager
- OpenAI API key (for AI analysis)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/alexzfe/finish-finder.git
   cd finish-finder
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Add your OpenAI API key to .env
   OPENAI_API_KEY=your_api_key_here
   # Optional but recommended for monitoring:
   # Server-side Sentry DSN for scraper/API alerts
   SENTRY_DSN=your_sentry_dsn
   # Client-side DSN to capture browser errors
   NEXT_PUBLIC_SENTRY_DSN=your_public_sentry_dsn
   # Adjust sample rates for tracing or session replay if desired
   SENTRY_TRACES_SAMPLE_RATE=0.1
   NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📱 Usage

### Navigating the Interface
1. **Browse Events**: Use navigation arrows to switch between upcoming UFC events
2. **View Fight Cards**: Fights are organized by Main Card, Preliminary Card, and Early Prelims
3. **Click Fighters**: Select any fight to see detailed AI analysis in the sticky sidebar
4. **Fun Scores**: Each fight displays an entertainment rating from 1-10

### Understanding Fun Scores
- **8-10**: 🔥 **MUST-WATCH** - Guaranteed fireworks and entertainment
- **6-7**: ⭐ **ENTERTAINING** - Good action throughout the bout
- **4-5**: 👍 **SOLID FIGHT** - Some excitement moments
- **1-3**: 👌 **TECHNICAL** - Decision likely, lower action

### Fight Analysis Details
- **Entertainment Reason**: AI explanation of why the fight will be exciting
- **Key Factors**: Tags highlighting what makes the fight interesting
- **Finish Probability**: Percentage chance of knockout or submission
- **Analyst Pick**: Brief prediction of how the fight will unfold

## 🎯 Project Status

### ✅ Current Features
- **Live UFC Data**: Real-time scraping from Sherdog with accurate fight information
- **OpenAI Integration**: GPT-4 powered entertainment analysis and predictions
- **UFC-Style Interface**: Authentic design matching official UFC website styling
- **Responsive Layout**: Optimized for desktop and mobile viewing
- **GitHub Pages Deployment**: Automated static site generation and hosting
- **Interactive Fight Cards**: Click-to-view detailed analysis with sticky sidebar
- **Entertainment Scoring**: AI-calculated fun scores and finish probabilities

### 🔧 Technical Implementation
- **Sherdog Scraper**: `HybridUFCService` class handles data collection and AI analysis
- **Static Site Generation**: Build process exports data to JSON for GitHub Pages
- **UFC Design System**: Consistent colors (#d20a0a, #191919) and Arial typography
- **Component Architecture**: Modular React components with TypeScript
- **Monitoring**: Sentry instrumentation via `sentry.*.config.ts` and route-level capture; scraper keeps `logs/missing-events.json` / `logs/missing-fights.json` counters before cancelling cards

### 🚧 Future Enhancements
- Admin dashboard for data management
- Historical fight outcome analysis
- Enhanced fighter statistics integration
- User preferences and fight alerts

## 🌐 Deployment

### GitHub Pages (Current)
The live site is automatically deployed to GitHub Pages at:
**https://alexzfe.github.io/finish-finder/**

### Building for GitHub Pages
```bash
# Build static site with latest UFC data
npm run pages:build

# Commit and push to deploy
git add .
git commit -m "Update GitHub Pages deployment"
git push
```

### Local Development
```bash
# Start development server
npm run dev

# Access at http://localhost:3000
```

## 📄 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📊 Data Sources

- **Fight Data**: Scraped from [Sherdog.com](https://sherdog.com) UFC organization pages
- **AI Analysis**: Powered by OpenAI GPT-4 for entertainment predictions
- **Fighter Information**: Real-time extraction of records, weight classes, and fight history

---

**⚠️ Disclaimer**: This application is for entertainment purposes only. Fight predictions are based on AI analysis and should not be used as the sole basis for betting decisions. UFC and fight data is sourced from publicly available information.
