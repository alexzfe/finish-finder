# Finish Finder Architecture Diagrams

This document contains Mermaid diagrams visualizing the system architecture, data flows, and component relationships.

---

## System Architecture Overview

```mermaid
graph TB
    subgraph "Frontend (Vercel)"
        UI[Next.js 16 App]
        UI --> |SSR/CSR| Pages[React 19 Pages]
        Pages --> |components| Components[UI Components]
    end

    subgraph "API Layer (Next.js API Routes)"
        Events[/api/db-events]
        Health[/api/health]
        Perf[/api/performance]
        Ingest[/api/internal/ingest]
        Admin[/api/admin/wipe-database]
    end

    subgraph "Services Layer"
        UnifiedPred[Unified Prediction Service]
        ScoreCalc[Score Calculator]
        Validator[Consistency Validator]
        Calibration[Calibration Service]
        Embeddings[Embeddings Service]
        HybridSearch[Hybrid Retrieval]
    end

    subgraph "External Services"
        OpenAI[OpenAI API]
        Anthropic[Anthropic API]
        BraveSearch[Brave Search API]
    end

    subgraph "Data Layer"
        Prisma[Prisma ORM]
        PG[(PostgreSQL + pgvector)]
        Monitoring[Query Monitor]
    end

    subgraph "Scraper (Python)"
        Scrapy[Scrapy Spider]
        Parser[HTML Parsers]
        Pipeline[API Pipeline]
        ImageScraper[Image Scraper]
    end

    subgraph "External Data Sources"
        UFCStats[UFCStats.com]
        ESPN[ESPN API]
        Wikipedia[Wikipedia API]
    end

    %% Frontend connections
    Pages --> Events
    Pages --> Health

    %% API connections
    Events --> Prisma
    Health --> Prisma
    Health --> Monitoring
    Perf --> Monitoring
    Ingest --> Prisma
    Admin --> Prisma

    %% Service connections
    UnifiedPred --> OpenAI
    UnifiedPred --> Anthropic
    UnifiedPred --> ScoreCalc
    UnifiedPred --> Validator
    UnifiedPred --> Calibration
    UnifiedPred --> Embeddings
    Embeddings --> OpenAI
    HybridSearch --> PG
    Calibration --> Prisma

    %% Scraper connections
    Scrapy --> Parser
    Parser --> Pipeline
    Pipeline --> Ingest
    Scrapy --> UFCStats
    ImageScraper --> ESPN
    ImageScraper --> Wikipedia

    %% Data layer
    Prisma --> PG
    Monitoring --> PG

    %% Styling
    classDef external fill:#f9f,stroke:#333,stroke-width:2px
    classDef database fill:#69b,stroke:#333,stroke-width:2px
    classDef api fill:#9f9,stroke:#333,stroke-width:2px

    class UFCStats,ESPN,Wikipedia,OpenAI,Anthropic,BraveSearch external
    class PG database
    class Events,Health,Perf,Ingest,Admin api
```

---

## AI Prediction Pipeline

```mermaid
flowchart TD
    subgraph Input["Input Layer"]
        F1[Fighter 1 Stats]
        F2[Fighter 2 Stats]
        CTX[Event Context]
    end

    subgraph Context["Context Enrichment"]
        EMB[Generate Embeddings]
        SIM[Find Similar Fighters]
        CHUNKS[Retrieve Context Chunks]
        DECAY[Apply Time Decay]
    end

    subgraph Prompt["Prompt Construction"]
        MULTI[Multi-Persona Framework]
        ANCHOR[Dynamic Probability Anchors]
        FEW[Few-Shot Examples]
        BUILD[Build Unified Prompt]
    end

    subgraph LLM["LLM Processing"]
        CALL[Structured Output Call]
        RETRY[Retry Logic 3x]
        PARSE[Parse Response]
    end

    subgraph Validation["Validation Layer"]
        RULES[9 Rule-Based Checks]
        CRITIQUE[Optional LLM Critique]
        CORRECT[Apply Corrections]
    end

    subgraph Scoring["Deterministic Scoring"]
        FINISH[Finish Probability]
        FUN[Fun Score 0-100]
        CONF[Confidence Adjustment]
        ML[ML Tier Comparison]
    end

    subgraph Calibration["Calibration Layer"]
        PLATT[Platt Scaling]
        CONFORMAL[Conformal Intervals]
        ENSEMBLE[ML Ensemble Blend]
    end

    subgraph Output["Output Layer"]
        LOG[Log to Database]
        RESULT[UnifiedFightPrediction]
    end

    %% Flow
    F1 & F2 & CTX --> EMB
    EMB --> SIM
    SIM --> CHUNKS
    CHUNKS --> DECAY

    DECAY --> MULTI
    MULTI --> ANCHOR
    ANCHOR --> FEW
    FEW --> BUILD

    BUILD --> CALL
    CALL --> RETRY
    RETRY --> PARSE

    PARSE --> RULES
    RULES -->|Issues Found| CRITIQUE
    RULES -->|Valid| FINISH
    CRITIQUE --> CORRECT
    CORRECT --> FINISH

    FINISH --> FUN
    FUN --> CONF
    CONF --> ML

    ML --> PLATT
    PLATT --> CONFORMAL
    CONFORMAL --> ENSEMBLE

    ENSEMBLE --> LOG
    LOG --> RESULT

    %% Styling
    classDef input fill:#ffd,stroke:#333
    classDef llm fill:#ddf,stroke:#333
    classDef scoring fill:#dfd,stroke:#333
    classDef calib fill:#fdd,stroke:#333

    class F1,F2,CTX input
    class CALL,RETRY,PARSE,CRITIQUE llm
    class FINISH,FUN,CONF,ML scoring
    class PLATT,CONFORMAL,ENSEMBLE calib
```

---

## Data Scraping Pipeline

```mermaid
sequenceDiagram
    participant GH as GitHub Actions
    participant Spider as Scrapy Spider
    participant UFC as UFCStats.com
    participant ESPN as ESPN API
    participant Parser as Parsers
    participant Pipeline as API Pipeline
    participant API as /api/internal/ingest
    participant DB as PostgreSQL

    GH->>Spider: Trigger Daily Run (2 AM UTC)
    activate Spider

    Spider->>UFC: GET /statistics/events/upcoming
    UFC-->>Spider: Event List HTML

    Spider->>Parser: parse_event_list()
    Parser-->>Spider: Event metadata[]

    loop For each event
        Spider->>UFC: GET /event/{event-id}
        UFC-->>Spider: Event Detail HTML

        Spider->>Parser: parse_event_detail()
        Parser-->>Spider: Fights[] + Fighters[]

        loop For each fighter
            Spider->>UFC: GET /fighter-details/{fighter-id}
            UFC-->>Spider: Fighter Profile HTML

            Spider->>Parser: parse_fighter_profile()
            Note over Parser: Extract 40+ fields
            Note over Parser: Calculate finish rates
            Parser-->>Spider: FighterItem

            opt Image Fetching Enabled
                Spider->>ESPN: Search athlete
                ESPN-->>Spider: Athlete ID
                Spider->>ESPN: GET CDN image
                ESPN-->>Spider: Image URL
            end
        end
    end

    Spider->>Pipeline: close_spider()
    activate Pipeline

    Pipeline->>Pipeline: Collect all items
    Note over Pipeline: Events, Fights, Fighters

    Pipeline->>API: POST /api/internal/ingest
    Note over Pipeline: Bearer token auth
    activate API

    API->>API: Validate with Zod
    API->>API: Normalize fighter order
    API->>DB: Transaction: Upsert all
    DB-->>API: Success

    API-->>Pipeline: 200 OK
    deactivate API

    Pipeline-->>Spider: Complete
    deactivate Pipeline
    deactivate Spider
```

---

## Database Entity Relationship

```mermaid
erDiagram
    Fighter ||--o{ Fight : "fights as fighter1"
    Fighter ||--o{ Fight : "fights as fighter2"
    Fighter ||--o{ FighterContextChunk : "has context"
    Event ||--o{ Fight : "contains"
    Event ||--o{ PredictionUsage : "tracks usage"
    Fight ||--o{ Prediction : "has predictions"
    Fight ||--o| WeakSupervisionLabel : "has label"
    Fight ||--o{ PredictionLog : "has logs"
    PredictionVersion ||--o{ Prediction : "creates"

    Fighter {
        string id PK
        string name
        string record
        int wins
        int losses
        int draws
        string weightClass
        float finishRate
        float koPercentage
        float submissionPercentage
        vector profile_embedding
        tsvector search_vector
    }

    Event {
        string id PK
        string name
        datetime date
        string location
        string venue
        boolean completed
        boolean cancelled
        string sourceUrl UK
    }

    Fight {
        string id PK
        string eventId FK
        string fighter1Id FK
        string fighter2Id FK
        string weightClass
        boolean titleFight
        boolean mainEvent
        int scheduledRounds
        float predictedFunScore
        float finishProbability
        boolean completed
        string winnerId
        string method
        int round
        string time
    }

    Prediction {
        string id PK
        string fightId FK
        string versionId FK
        float finishProbability
        float finishConfidence
        float funScore
        float funConfidence
        json finishReasoning
        json funBreakdown
        string modelUsed
        int tokensUsed
        float costUsd
    }

    PredictionVersion {
        string id PK
        string version UK
        string finishPromptHash
        string funScorePromptHash
        boolean active
        float brierScore
        float funScoreCorrelation
    }

    CalibrationParams {
        string id PK
        string predictionType
        float paramA
        float paramB
        json conformityScores
        float coverageLevel
        int trainedOn
        boolean active
    }

    WeakSupervisionLabel {
        string id PK
        string fightId FK UK
        boolean actualFinish
        string entertainmentLabel
        float entertainmentScore
        float entertainmentConfidence
        string[] contributingFunctions
    }

    FighterContextChunk {
        string id PK
        string fighterId FK
        text content
        string contentType
        vector embedding
        tsvector search_vector
        datetime publishedAt
        datetime expiresAt
    }

    PredictionLog {
        string id PK
        string fightId FK
        float rawFinishProbability
        float calibratedFinishProbability
        int rawFunScore
        float funScoreLower
        float funScoreUpper
        boolean actualFinish
        string actualEntertainment
    }

    PredictionUsage {
        string id PK
        string eventId FK
        int fightsProcessed
        int totalTokensEstimated
    }

    QueryMetric {
        string id PK
        string query
        string model
        string action
        int duration
        string performance
    }

    ScrapeLog {
        string id PK
        datetime startTime
        datetime endTime
        string status
        int eventsFound
        int fightsAdded
        int fightersAdded
    }
```

---

## Frontend Component Hierarchy

```mermaid
graph TD
    subgraph Pages
        Home[page.tsx<br/>Main Application]
        Admin[admin/page.tsx<br/>Admin Dashboard]
    end

    subgraph Layout
        RootLayout[layout.tsx<br/>Sentry + Providers]
    end

    subgraph UIComponents["UI Components"]
        Header[Header.tsx<br/>App Branding]
        EventNav[EventNavigation.tsx<br/>Carousel + Touch]
        EventSel[EventSelector.tsx<br/>Grid Selection]
    end

    subgraph FightComponents["Fight Components"]
        FightList[FightList.tsx<br/>Fight Cards]
        FightModal[FightDetailsModal.tsx<br/>Mobile Detail View]
    end

    subgraph FighterComponents["Fighter Components"]
        Avatar[FighterAvatar.tsx<br/>Image + Fallback]
        AvatarPair[FighterAvatarPair<br/>VS Display]
    end

    subgraph AdminComponents["Admin Components"]
        PerfDash[PerformanceDashboard.tsx<br/>Metrics Charts]
        DBMgmt[DatabaseManagement.tsx<br/>DB Operations]
    end

    subgraph Hooks
        useFighterImage[useFighterImage<br/>Image Caching]
    end

    subgraph Services
        ClientImage[ClientImageService<br/>Multi-source Search]
    end

    %% Hierarchy
    RootLayout --> Home
    RootLayout --> Admin

    Home --> Header
    Home --> EventNav
    Home --> FightList
    Home --> FightModal

    FightList --> Avatar
    FightList --> AvatarPair
    FightModal --> Avatar

    Avatar --> useFighterImage
    useFighterImage --> ClientImage

    Admin --> Header
    Admin --> PerfDash
    Admin --> DBMgmt

    %% Data flow
    Home -.->|fetch| Events["/api/db-events"]
    Admin -.->|fetch| Perf["/api/performance"]
    Admin -.->|post| Wipe["/api/admin/wipe-database"]

    %% Styling
    classDef page fill:#ffd,stroke:#333
    classDef component fill:#dfd,stroke:#333
    classDef hook fill:#ddf,stroke:#333
    classDef api fill:#fdd,stroke:#333

    class Home,Admin page
    class Header,EventNav,EventSel,FightList,FightModal,Avatar,AvatarPair,PerfDash,DBMgmt component
    class useFighterImage,ClientImage hook
    class Events,Perf,Wipe api
```

---

## Calibration System

```mermaid
flowchart LR
    subgraph Training["Training Phase"]
        Historical[Historical Predictions]
        Outcomes[Fight Outcomes]
        DSPy[DSPy Eval Data<br/>516 fights]
    end

    subgraph PlattTraining["Platt Scaling Training"]
        LogOdds[Transform to Log-Odds]
        GradDesc[Gradient Descent]
        Params[Learn A, B params<br/>A=1.7034, B=-0.4888]
    end

    subgraph ConformalTraining["Conformal Training"]
        Residuals[Calculate Residuals]
        Sort[Sort Conformity Scores]
        Threshold[Compute Threshold<br/>@ 90% coverage]
    end

    subgraph Storage["Storage"]
        CalibDB[(CalibrationParams<br/>Table)]
    end

    subgraph Inference["Inference Phase"]
        RawPred[Raw LLM Prediction]
        ApplyPlatt[Apply Platt Scaling<br/>σ(A·logit(p) + B)]
        ApplyConf[Apply Conformal<br/>±threshold interval]
        Calibrated[Calibrated Output]
    end

    subgraph Monitoring["Monitoring"]
        Metrics[Track Brier, ECE, MCE]
        Report[Calibration Report]
    end

    %% Training flow
    Historical --> LogOdds
    Outcomes --> LogOdds
    DSPy --> LogOdds
    LogOdds --> GradDesc
    GradDesc --> Params
    Params --> CalibDB

    Historical --> Residuals
    Outcomes --> Residuals
    Residuals --> Sort
    Sort --> Threshold
    Threshold --> CalibDB

    %% Inference flow
    RawPred --> ApplyPlatt
    CalibDB --> ApplyPlatt
    ApplyPlatt --> ApplyConf
    CalibDB --> ApplyConf
    ApplyConf --> Calibrated

    %% Monitoring
    Calibrated --> Metrics
    Metrics --> Report

    %% Styling
    classDef training fill:#ffd,stroke:#333
    classDef storage fill:#69b,stroke:#333
    classDef inference fill:#dfd,stroke:#333

    class Historical,Outcomes,DSPy,LogOdds,GradDesc,Params,Residuals,Sort,Threshold training
    class CalibDB storage
    class RawPred,ApplyPlatt,ApplyConf,Calibrated inference
```

---

## Hybrid Retrieval System

```mermaid
flowchart TD
    subgraph Query["Query Processing"]
        Input[Search Query]
        QueryEmb[Generate Query Embedding<br/>text-embedding-3-small]
    end

    subgraph VectorSearch["Vector Search (pgvector)"]
        CosineDist[Cosine Distance Search]
        VecResults[Top-K Vector Results]
        VecRank[Assign Vector Ranks]
    end

    subgraph TextSearch["Full-Text Search (PostgreSQL)"]
        TSQuery[to_tsquery Conversion]
        BM25[BM25-like Ranking]
        TextResults[Top-K Text Results]
        TextRank[Assign Text Ranks]
    end

    subgraph Fusion["Reciprocal Rank Fusion"]
        RRF[RRF Score Calculation<br/>k=60]
        Combine[Combine & Deduplicate]
        FinalSort[Sort by RRF Score]
    end

    subgraph TimeDecay["Time-Decay Weighting"]
        GetAge[Calculate Content Age]
        HalfLife[Apply Half-Life<br/>news:30d, analysis:90d<br/>history:180d, stats:365d]
        WeightedScore[Decay × RRF Score]
    end

    subgraph Output["Output"]
        TopK[Return Top-K Results]
        Context[Formatted Context<br/>for LLM Prompt]
    end

    %% Flow
    Input --> QueryEmb
    QueryEmb --> CosineDist
    CosineDist --> VecResults
    VecResults --> VecRank

    Input --> TSQuery
    TSQuery --> BM25
    BM25 --> TextResults
    TextResults --> TextRank

    VecRank --> RRF
    TextRank --> RRF
    RRF --> Combine
    Combine --> FinalSort

    FinalSort --> GetAge
    GetAge --> HalfLife
    HalfLife --> WeightedScore

    WeightedScore --> TopK
    TopK --> Context

    %% Formula annotations
    RRF -.->|"1/(k + rank_vec) + 1/(k + rank_text)"| Combine
    HalfLife -.->|"e^(-0.693 × age/halflife)"| WeightedScore

    %% Styling
    classDef vector fill:#ddf,stroke:#333
    classDef text fill:#fdd,stroke:#333
    classDef fusion fill:#dfd,stroke:#333
    classDef decay fill:#ffd,stroke:#333

    class CosineDist,VecResults,VecRank vector
    class TSQuery,BM25,TextResults,TextRank text
    class RRF,Combine,FinalSort fusion
    class GetAge,HalfLife,WeightedScore decay
```

---

## GitHub Actions Workflows

```mermaid
flowchart LR
    subgraph Triggers["Triggers"]
        Cron1[Cron: 2:00 AM UTC]
        Cron2[Cron: 1:30 AM UTC]
        Manual[Manual Dispatch]
    end

    subgraph ScraperWorkflow["scraper.yml"]
        Setup1[Setup Python 3.11]
        Install1[pip install -r requirements.txt]
        RunSpider[scrapy crawl ufcstats]
        PostAPI[POST to /api/internal/ingest]
    end

    subgraph PredictionWorkflow["ai-predictions.yml"]
        Setup2[Setup Node.js]
        Install2[npm ci]
        Generate[npx ts-node<br/>unified-ai-predictions-runner.ts]
        SaveDB[Update predictions in DB]
    end

    subgraph Environment["Environment"]
        Secrets[GitHub Secrets<br/>DATABASE_URL<br/>INGEST_API_SECRET<br/>OPENAI_API_KEY]
    end

    %% Trigger connections
    Cron1 --> Setup1
    Manual --> Setup1
    Cron2 --> Setup2
    Manual --> Setup2

    %% Scraper workflow
    Setup1 --> Install1
    Install1 --> RunSpider
    RunSpider --> PostAPI

    %% Prediction workflow
    Setup2 --> Install2
    Install2 --> Generate
    Generate --> SaveDB

    %% Secrets
    Secrets -.-> RunSpider
    Secrets -.-> PostAPI
    Secrets -.-> Generate
    Secrets -.-> SaveDB

    %% Styling
    classDef trigger fill:#ffd,stroke:#333
    classDef workflow fill:#dfd,stroke:#333
    classDef secret fill:#fdd,stroke:#333

    class Cron1,Cron2,Manual trigger
    class Setup1,Install1,RunSpider,PostAPI,Setup2,Install2,Generate,SaveDB workflow
    class Secrets secret
```

---

## Request/Response Flow

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Next as Next.js Server
    participant API as API Routes
    participant Prisma
    participant PG as PostgreSQL
    participant Sentry

    User->>Browser: Navigate to /
    Browser->>Next: GET /
    activate Next

    Next->>Next: Server-side render page.tsx
    Next-->>Browser: HTML + hydration data
    deactivate Next

    Browser->>Browser: React hydration
    Browser->>API: GET /api/db-events

    activate API
    API->>Prisma: findMany events
    Prisma->>PG: SELECT with JOINs
    PG-->>Prisma: Result set
    Prisma-->>API: Event[] with fights

    alt Success
        API-->>Browser: 200 { success: true, data: { events } }
    else Error
        API->>Sentry: captureException()
        API-->>Browser: 500 { error: "..." }
    end
    deactivate API

    Browser->>Browser: Update React state
    Browser->>User: Display fight cards

    User->>Browser: Click on fight
    Browser->>Browser: setSelectedFight()

    alt Mobile View
        Browser->>Browser: Open FightDetailsModal
    else Desktop View
        Browser->>Browser: Update sidebar panel
    end

    Browser->>User: Show fight analysis
```

---

## Score Calculation Formula

```mermaid
flowchart TD
    subgraph Inputs["LLM Outputs (1-5 scales)"]
        Pace[pace: 1-5]
        Danger[finishDanger: 1-5]
        Tech[technicality: 1-5]
        Style[styleClash: Comp/Neutral/Cancel]
        Brawl[brawlPotential: bool]
    end

    subgraph FinishCalc["Finish Probability Calculation"]
        Baseline[Weight Class Baseline<br/>HW: 0.70, LW: 0.55, etc.]
        DangerMult["finishDangerMultiplier<br/>0.4 + (danger-1) × 0.2"]
        StyleMult["styleMultiplier<br/>Comp: 1.15, Neutral: 1.0, Cancel: 0.75"]
        FinishProd["probability = baseline × dangerMult × styleMult"]
        FinishClamp["Clamp [0.15, 0.85]"]
    end

    subgraph FunCalc["Fun Score Calculation (0-100)"]
        PacePoints["pace_points<br/>(pace-1) × 35/4 = 0-35"]
        DangerPoints["danger_points<br/>(danger-1) × 35/4 = 0-35"]
        TechPoints["tech_points<br/>peaks at 3-4, max 10"]
        BrawlBonus["brawl_bonus<br/>+10 if true"]
        ContextBonus["context_bonus<br/>title: +5, main: +2, rival: +3"]
        CancelPenalty["cancel_penalty<br/>-15 if Canceling"]
        FunSum["Sum all components"]
        FunClamp["Clamp [0, 100]"]
    end

    subgraph ConfCalc["Confidence Adjustment"]
        BaseConf[LLM confidence: 0-1]
        LowPaceBrawl["pace ≤ 2 AND brawl?<br/>-10%"]
        HighPaceCancel["pace ≥ 4 AND Cancel?<br/>-10%"]
        TechBrawl["tech = 5 AND brawl?<br/>-5%"]
        ConfClamp["Clamp [0.3, 1.0]"]
    end

    %% Finish flow
    Pace --> FinishCalc
    Danger --> DangerMult
    Style --> StyleMult
    Baseline --> FinishProd
    DangerMult --> FinishProd
    StyleMult --> FinishProd
    FinishProd --> FinishClamp

    %% Fun flow
    Pace --> PacePoints
    Danger --> DangerPoints
    Tech --> TechPoints
    Brawl --> BrawlBonus
    Style --> CancelPenalty
    PacePoints --> FunSum
    DangerPoints --> FunSum
    TechPoints --> FunSum
    BrawlBonus --> FunSum
    ContextBonus --> FunSum
    CancelPenalty --> FunSum
    FunSum --> FunClamp

    %% Confidence flow
    BaseConf --> LowPaceBrawl
    Pace --> LowPaceBrawl
    Brawl --> LowPaceBrawl
    LowPaceBrawl --> HighPaceCancel
    Style --> HighPaceCancel
    HighPaceCancel --> TechBrawl
    Tech --> TechBrawl
    TechBrawl --> ConfClamp

    %% Styling
    classDef input fill:#ffd,stroke:#333
    classDef calc fill:#dfd,stroke:#333
    classDef output fill:#ddf,stroke:#333

    class Pace,Danger,Tech,Style,Brawl input
    class Baseline,DangerMult,StyleMult,FinishProd,PacePoints,DangerPoints,TechPoints,BrawlBonus,ContextBonus,CancelPenalty,FunSum,BaseConf,LowPaceBrawl,HighPaceCancel,TechBrawl calc
    class FinishClamp,FunClamp,ConfClamp output
```

---

## Deployment Architecture

```mermaid
graph TB
    subgraph GitHub["GitHub"]
        Repo[Repository]
        Actions[GitHub Actions]
        Secrets[Secrets Manager]
    end

    subgraph Vercel["Vercel Platform"]
        Edge[Edge Network CDN]
        Serverless[Serverless Functions]
        Preview[Preview Deployments]
        Prod[Production]
    end

    subgraph Supabase["Supabase"]
        Pooler[PgBouncer Pooler<br/>:6543]
        Direct[Direct Connection<br/>:5432]
        PG[(PostgreSQL 15<br/>+ pgvector)]
    end

    subgraph External["External Services"]
        OpenAI[OpenAI API]
        Anthropic[Anthropic API]
        Sentry[Sentry.io]
    end

    %% GitHub flow
    Repo -->|push main| Vercel
    Actions -->|cron jobs| Serverless
    Secrets --> Actions

    %% Vercel internal
    Edge --> Serverless
    Edge --> Preview
    Edge --> Prod

    %% Database connections
    Serverless -->|runtime queries| Pooler
    Actions -->|migrations| Direct
    Pooler --> PG
    Direct --> PG

    %% External services
    Serverless --> OpenAI
    Serverless --> Anthropic
    Serverless --> Sentry

    %% Styling
    classDef github fill:#24292e,stroke:#fff,color:#fff
    classDef vercel fill:#000,stroke:#fff,color:#fff
    classDef supabase fill:#3ecf8e,stroke:#333
    classDef external fill:#f9f,stroke:#333

    class Repo,Actions,Secrets github
    class Edge,Serverless,Preview,Prod vercel
    class Pooler,Direct,PG supabase
    class OpenAI,Anthropic,Sentry external
```

---

## Multi-Persona Prompt Architecture

```mermaid
flowchart TD
    subgraph Input["Fighter Data"]
        Stats1[Fighter 1 Statistics<br/>40+ fields]
        Stats2[Fighter 2 Statistics<br/>40+ fields]
        Context[Event Context<br/>title, main event, rivalry]
    end

    subgraph Personas["Multi-Persona Analysis"]
        Statistician["🔢 Statistician<br/>Pure Numbers Analysis"]
        TapeWatcher["🎬 Tape Watcher<br/>Fighting Habits & Intangibles"]
        Synthesizer["🎯 Synthesizer<br/>Reconcile Both Views"]
    end

    subgraph Analysis["Analysis Components"]
        Defense[Vulnerability Analysis<br/>Defense stats, loss methods]
        Offense[Offense Analysis<br/>Finish capability, striking]
        StyleMatch[Style Matchup<br/>How styles interact]
        Final[Final Assessment<br/>Combined synthesis]
    end

    subgraph Output["Structured Output"]
        Attributes["Attributes (1-5 scales)<br/>pace, finishDanger, technicality"]
        StyleClash["styleClash<br/>Complementary/Neutral/Canceling"]
        BoolFlags["Boolean Flags<br/>brawlPotential, groundBattleLikely"]
        Reasoning["Reasoning Chain<br/>finishAnalysis, funAnalysis"]
        Narrative["Fight Narrative<br/>3-4 sentence simulation"]
        KeyFactors["Key Factors<br/>3-5 decisive elements"]
    end

    %% Input to Personas
    Stats1 --> Statistician
    Stats2 --> Statistician
    Stats1 --> TapeWatcher
    Stats2 --> TapeWatcher
    Context --> Synthesizer

    %% Persona analysis
    Statistician --> Defense
    Statistician --> Offense
    TapeWatcher --> StyleMatch
    Defense --> Synthesizer
    Offense --> Synthesizer
    StyleMatch --> Synthesizer
    Synthesizer --> Final

    %% Analysis to Output
    Final --> Attributes
    Final --> StyleClash
    Final --> BoolFlags
    Final --> Reasoning
    Final --> Narrative
    Final --> KeyFactors

    %% Styling
    classDef input fill:#ffd,stroke:#333
    classDef persona fill:#ddf,stroke:#333
    classDef analysis fill:#dfd,stroke:#333
    classDef output fill:#fdd,stroke:#333

    class Stats1,Stats2,Context input
    class Statistician,TapeWatcher,Synthesizer persona
    class Defense,Offense,StyleMatch,Final analysis
    class Attributes,StyleClash,BoolFlags,Reasoning,Narrative,KeyFactors output
```

---

## Notes

- All diagrams use [Mermaid](https://mermaid.js.org/) syntax
- View these diagrams in VS Code with the Mermaid extension or on GitHub
- For interactive viewing, paste code into [Mermaid Live Editor](https://mermaid.live/)

---

**Last Updated:** 2026-01-05
