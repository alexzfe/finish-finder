# 🥊 Fun Fight Predictor

An AI-powered web application that analyzes upcoming UFC fights to predict which matches will be the most entertaining to watch. Using machine learning algorithms and fighter statistics, the platform provides "fun scores" and detailed analysis to help UFC fans prioritize their viewing experience.

## ✨ Features

### 🎯 Core Functionality
- **AI Fight Prediction**: Advanced algorithms analyze fighter stats, styles, and popularity to predict entertainment value
- **Fun Score Rating**: 0-100 scoring system for fight entertainment potential
- **Interactive Fight Cards**: Visual representation of upcoming UFC events with highlighted fun fights
- **Detailed Analysis**: Click any fight for in-depth AI-generated descriptions and factor breakdowns
- **Customizable Filtering**: Adjust fun score thresholds to find fights that match your preferences

### 📊 Prediction Factors
- **Finish Rates**: KO/submission percentages and historical fight endings
- **Stylistic Matchups**: Striker vs striker, grappler vs striker analysis
- **Fan Popularity**: Social media following and recent buzz metrics
- **Fight Stakes**: Title fights, main events, and career implications
- **Skill Parity**: Evenly matched opponents often produce the best fights
- **Fighting Styles**: Aggressive, technical, or entertaining fighting approaches

## 🛠️ Technology Stack

### Frontend
- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Framer Motion**: Animations and transitions

### Backend
- **Next.js API Routes**: Server-side functionality
- **Prisma**: Database ORM and migrations
- **SQLite**: Development database
- **Custom AI Models**: Multi-factor entertainment scoring

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ installed
- npm package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fun-fight-predictor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📱 Usage

### Viewing Fight Predictions
1. Select an upcoming UFC event from the event selector
2. Use the fun score slider to filter fights by entertainment potential
3. Browse highlighted "Fun Fights" with scores 80+
4. Click any fight card for detailed analysis

### Understanding Fun Scores
- **90-100**: 🔥 MUST-WATCH - Guaranteed entertainment
- **80-89**: ⭐ HIGHLY ENTERTAINING - Strong recommendation
- **70-79**: 👍 GOOD ENTERTAINMENT - Worth watching
- **60-69**: 👌 DECENT FIGHT - Moderate interest
- **Below 60**: 😴 POTENTIALLY SLOW - Lower priority

## 🔧 API Endpoints

### GET /api/predict
Test the prediction system with mock fighter data

### GET /api/events
Retrieve upcoming UFC events (when data scraping is enabled)

## 🎯 Current Status

### ✅ Completed Features
- Core prediction algorithm with multiple factors
- Interactive React UI with fight cards
- Database schema for fighters, fights, and events
- API endpoints for predictions and data
- Mock data demonstrating full functionality
- Responsive design with UFC-inspired styling

### 🚧 Next Development Phase
- Real UFC data integration
- Enhanced AI descriptions with OpenAI
- Historical fight outcome training
- User accounts and preferences
- Mobile optimization

## 📄 License

This project is licensed under the MIT License.

---

**⚠️ Disclaimer**: This application is for entertainment purposes only. Fight predictions are based on statistical analysis and should not be used as the sole basis for betting decisions.
