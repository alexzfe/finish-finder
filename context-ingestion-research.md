# Building an MMA Fighter Context Ingestion Pipeline for RAG-Based Fight Prediction

The optimal strategy combines **RSS feeds for news**, **UFC Stats scraping for statistics**, **hybrid search with pgvector + BM25**, and **OpenAI's Batch API at $0.01/1M tokens**—achieving sub-$5/month costs while prioritizing the ~30 fighters competing weekly. Using APScheduler with PostgreSQL SKIP LOCKED for job queuing eliminates external infrastructure needs, while content hashing prevents redundant embedding generation.

---

## Ranked data sources for MMA content ingestion

The MMA data landscape divides into three tiers: free RSS-based news feeds, scrapable statistics databases, and commercial APIs. For a budget-conscious personal project, the **free tier** provides sufficient coverage.

### Statistics and fight data (priority for predictions)

**UFCStats.com** (formerly FightMetric) remains the gold standard for detailed fight statistics—significant strikes, takedowns, control time, and round-by-round breakdowns. No official API exists, but multiple open-source scrapers on GitHub provide reliable access. This is your **most valuable data source** for quantitative fight prediction features.

**Sherdog.com** offers the largest fighter database (**143,000+ fighters**, 484,000+ fights) with complete fight histories and biographical data. The site provides an RSS feed at `sherdog.com/rss/news.xml`, and npm/Python scrapers exist for fighter records. **Tapology.com** complements this with amateur records and worldwide coverage—an unofficial API exists on RapidAPI.

### News and analysis sources

| Source | Signal Quality | RSS Feed | Best For |
|--------|---------------|----------|----------|
| **MMAFighting.com** | High | `mmafighting.com/rss/current` | Breaking news, in-depth analysis |
| **MMAJunkie.com** | High | `mmajunkie.usatoday.com/feed` | Injury reports, official announcements |
| **Sherdog.com** | Good | `sherdog.com/rss/news.xml` | Fighter records, historical context |
| **BloodyElbow.com** | Good | Available | Editorial analysis |
| **ESPN MMA** | High | Via ESPN feeds | Official UFC partnerships |

RSS feeds should be your **primary news ingestion method**—they're explicitly designed for programmatic access, respect robots.txt implicitly, and avoid ToS complications.

### Commercial APIs (if budget allows)

**SportsDataIO** offers comprehensive UFC coverage including fight schedules, live results, and betting odds via REST API. A free trial exists, with paid tiers starting around $200-500/month. **Sportradar MMA API** provides enterprise-grade data but typically costs $500-1,000+/month. For personal projects, these are unnecessary given free alternatives.

### Journalist credibility hierarchy

Content from **Ariel Helwani** (MMA Journalist of the Year since 2010) and **Brett Okamoto** (ESPN's lead MMA reporter) carries significantly higher prediction value than general news. Track their Twitter accounts and The MMA Hour podcast for breaking injury news and training camp intelligence. Other high-signal journalists include **Luke Thomas** (technical analysis), **Kevin Iole** (Yahoo), and **Marc Raimondi** (ESPN).

---

## Content extraction and fighter identification strategy

### Article extraction library selection

Benchmarks show **trafilatura** achieves the highest F1 score (**0.958**) for article extraction with excellent boilerplate removal and metadata extraction. Use newspaper4k as a fallback for edge cases.

```python
import trafilatura

def extract_article(url):
    downloaded = trafilatura.fetch_url(url)
    return trafilatura.extract(
        downloaded,
        include_comments=False,
        output_format='json',
        with_metadata=True
    )
```

### Fighter name resolution

The core challenge is mapping mentions like "Bones," "The Notorious," or "Khabib" to canonical fighter IDs in your PostgreSQL database. A **three-layer approach** handles this reliably:

1. **Alias lookup table**: Map all known nicknames and variations to canonical names
2. **spaCy EntityRuler**: Pattern-match fighter names before general NER
3. **Fuzzy matching**: Use RapidFuzz (threshold 85%) for handling typos and partial matches

```python
FIGHTER_ALIASES = {
    "conor mcgregor": ["the notorious", "mcgregor", "conor"],
    "jon jones": ["bones", "jon jones", "jones"],
    "khabib nurmagomedov": ["khabib", "the eagle", "nurmagomedov"],
}
```

### Optimal chunking for hybrid retrieval

For your **512-token chunks with 100-token overlap** configuration, use `RecursiveCharacterTextSplitter` from LangChain. Research shows **256-512 tokens** balances semantic coherence for embedding similarity with sufficient keyword density for BM25.

**Critical practice**: Prefix chunks with structured metadata to improve retrieval:
```python
chunk_with_context = f"[Fighter: {fighter_name}] [Type: {content_type}] [Date: {pub_date}] {chunk_text}"
```

### Multimedia handling

- **YouTube transcripts**: Use `youtube-transcript-api` for auto-generated captions (free, no download needed)
- **Podcasts**: OpenAI Whisper API at **$0.006/minute** ($0.36/hour for The MMA Hour)
- For fight week, transcribing Ariel Helwani's interviews provides high-signal training camp intelligence

---

## Content classification approach

### LLM-based classification is most practical

For classifying content into your five types (news, training_camp, analysis, injury, fight_history), a simple **GPT-4o-mini prompt** outperforms rule-based systems while costing under $0.001 per article:

```python
classification_prompt = """
Classify this MMA article into exactly one category:
- news: General announcements, fight bookings, rankings updates
- training_camp: Training footage, sparring partners, camp location changes
- injury: Injury reports, medical suspensions, recovery updates
- analysis: Technical breakdowns, style matchup discussions, predictions
- fight_history: Fight recaps, historical records, career retrospectives

Article: {article_text}
Category:
"""
```

### High-value signals for fight prediction

Prioritize ingesting content mentioning these prediction-relevant signals:

- **Injuries**: Any mention of "injured," "out," "surgery," "medical suspension"
- **Weight cuts**: "Making weight," "weight issues," "moving up/down"
- **Training camp changes**: New coaches, gym switches, sparring partner updates
- **Layoffs**: Time since last fight (>12 months is significant)
- **Motivation indicators**: Contract disputes, retirement speculation, title shots

### Filtering low-value content

Implement a **quality gate** before embedding generation:
- Skip articles under 200 words (often promotional fluff)
- Filter clickbait patterns: "You won't believe," "shocking," excessive caps
- Deprioritize content from low-credibility sources (fan forums, unverified accounts)
- Mark unconfirmed rumors with low confidence scores

---

## Pipeline architecture and scheduling strategy

### APScheduler is the right choice for this project

For a personal project with 12-hour freshness tolerance, **APScheduler** provides the optimal balance of simplicity and capability. It runs in-process (no Redis/Celery needed), supports cron expressions, and can persist job schedules to PostgreSQL.

```python
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler(jobstores={'default': SQLAlchemyJobStore(url=DATABASE_URL)})
scheduler.add_job(ingest_rss_feeds, 'interval', hours=6)
scheduler.add_job(check_priority_fighters, 'interval', hours=2)
scheduler.add_job(cleanup_expired_content, 'cron', day_of_week='sun', hour=3)
scheduler.start()
```

### Dynamic priority-based scheduling

With 4,451 fighters in your database but only ~30 fighting per week, implement **priority tiers**:

| Days to Fight | Priority | Polling Frequency | Content Scope |
|---------------|----------|-------------------|---------------|
| 0-7 (fight week) | Critical | Every 30 min | All mentions |
| 8-30 | High | Every 2 hours | News, injuries |
| 31-90 | Medium | Every 6 hours | Major news only |
| 90+ or unscheduled | Low | Daily | Ignore unless major |

This reduces ingestion volume by ~90% while capturing all prediction-relevant content for upcoming events.

### Content deduplication strategy

Implement **three-layer deduplication** to prevent redundant embeddings:

1. **URL normalization**: Strip query params and fragments before storage
2. **Content hashing**: SHA256 hash of extracted text body
3. **Semantic similarity**: Flag articles with embedding cosine similarity >0.95 as near-duplicates

```sql
CREATE TABLE content_items (
  id SERIAL PRIMARY KEY,
  canonical_url TEXT UNIQUE,
  content_hash TEXT NOT NULL,
  embedding vector(1536),
  CONSTRAINT unique_content UNIQUE (content_hash)
);
```

### Queue-based processing with PostgreSQL

Skip Redis—use **PostgreSQL SKIP LOCKED** for your job queue:

```sql
WITH claimed AS (
  SELECT id FROM job_queue
  WHERE status = 'pending'
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE job_queue SET status = 'processing'
FROM claimed WHERE job_queue.id = claimed.id
RETURNING *;
```

---

## Hybrid search implementation with time decay

### Combining pgvector with BM25

Your hybrid search should use **Reciprocal Rank Fusion (RRF)** to combine semantic and lexical results:

```sql
WITH semantic AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $query_embedding) AS rank
  FROM chunks ORDER BY embedding <=> $query_embedding LIMIT 20
),
fulltext AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, query) DESC) AS rank
  FROM chunks, plainto_tsquery('english', $query_text) query
  WHERE tsv @@ query LIMIT 20
)
SELECT id, SUM(1.0 / (60 + rank)) AS rrf_score
FROM (SELECT * FROM semantic UNION ALL SELECT * FROM fulltext) combined
GROUP BY id ORDER BY rrf_score DESC LIMIT 10;
```

The constant **k=60** in RRF is standard and controls rank decay rate.

### Time-decay half-lives by content type

| Content Type | Half-Life | Rationale |
|--------------|-----------|-----------|
| Breaking news | 3-7 days | Rapidly obsolete after event passes |
| Injury reports | 14-30 days | Remains relevant until fighter returns |
| Training camp | 7-14 days | Only relevant for specific fight |
| Analysis pieces | 30-60 days | Longer shelf life for technical insights |
| Fight history | 365+ days | Evergreen reference material |

```sql
CREATE FUNCTION time_decay_score(pub_date TIMESTAMPTZ, half_life INTEGER)
RETURNS FLOAT AS $$
  SELECT exp(-ln(2) * EXTRACT(EPOCH FROM (NOW() - pub_date)) / (half_life * 86400))
$$ LANGUAGE SQL IMMUTABLE;
```

---

## Cost optimization achieving sub-$5/month

### OpenAI embedding costs breakdown

At **$0.02/1M tokens** for text-embedding-3-small (or **$0.01/1M with Batch API**), even high-volume ingestion remains cheap:

| Volume | Articles/Month | Monthly Cost (Batch) |
|--------|----------------|---------------------|
| Conservative | 3,000 | $0.03 |
| Medium | 15,000 | $0.15 |
| High | 60,000 | $0.60 |

### Key cost optimizations

1. **Batch API for 50% savings**: Submit embedding requests in batches (12-24hr turnaround, typically completes in 10-20 minutes)
2. **Content hashing**: Check hash before embedding—skip unchanged content, saving 30-40%
3. **Dimension reduction**: Request 512 dimensions instead of 1536 (Matryoshka truncation) for 66% storage savings with ~2-3% quality loss
4. **Priority filtering**: Only embed content for fighters with fights scheduled in next 90 days

### Alternative embedding models

| Provider | Model | Price/1M Tokens | Quality | Free Tier |
|----------|-------|-----------------|---------|-----------|
| OpenAI | text-embedding-3-small | $0.02 | 62.3% | $5 credits |
| **Voyage AI** | voyage-3.5-lite | $0.02 | 66.1% | **200M tokens free** |
| **Google** | gemini-embedding-001 | **FREE** | 71.5% | Unlimited |
| Local | all-mpnet-base-v2 | $0 | ~62% | - |

**Recommendation**: Start with **Voyage AI's free tier** (200M tokens = ~200K articles) for the best quality-to-cost ratio, then evaluate Google Gemini for ongoing production.

---

## Legal compliance checklist

### Safe practices for personal projects

Based on hiQ Labs v. LinkedIn and Van Buren v. United States, scraping **publicly available data without login** does not violate the CFAA. However, Terms of Service violations remain enforceable under contract law.

**Compliant approach**:
- ✅ Use RSS feeds as primary news source (explicitly intended for programmatic access)
- ✅ Respect robots.txt directives and Crawl-delay
- ✅ Implement 3-5 second delays between requests
- ✅ Use identifiable User-Agent: `"MMAPredictor/1.0 (personal project; your@email.com)"`
- ✅ Scrape only logged-out public data
- ⚠️ Check ToS before scraping UFC.com or ESPN (typically most restrictive)
- ❌ Avoid scraping Twitter/X (explicit ToS prohibition, aggressive enforcement)
- ❌ Don't circumvent rate limits or use rotating proxies

### Reddit API post-2023

Reddit's API costs **$0.24/1,000 calls** for paid access, but personal research projects may qualify for the free tier (<100 queries/minute with OAuth). Apply through Reddit's developer portal, emphasizing non-commercial use.

---

## Alternative approaches worth considering

### Existing datasets for bootstrapping

Several **Kaggle datasets** provide historical UFC data for initial model training:
- **UFC Complete Dataset (1996-2024)** by maksbasher—full event statistics
- **UFC DATASETS [1994-2025]** by neelagiriaditya—events, fights, fighter profiles
- **ufcdata** by rajeevw—widely used for ML projects

These eliminate the need for historical backfill—use them for training and focus your pipeline on **ongoing incremental updates**.

### GitHub scrapers to leverage

- **WarrierRajeev/UFC-Predictions**: Includes UFCStats.com scraper with preprocessed dataset
- **Montanaz0r/MMA-parser-for-Sherdog-and-UFC-data**: Python parser outputting CSV/JSON
- **victor-lillo/octagon-api**: Free API wrapper for UFC rankings and fighter info

### When commercial APIs make sense

If your project scales to production, **SportsDataIO** ($200-500/month) provides:
- Real-time odds data (critical for betting-line-based predictions)
- Official fighter rankings and schedules
- Elimination of scraping maintenance burden

For a personal project, this is unnecessary—the free alternatives above provide sufficient coverage.

---

## Recommended architecture summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    MMA RAG Ingestion Pipeline                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │ RSS Feeds   │───►│  feedparser  │───►│   URL Queue      │   │
│  │ (6-hourly)  │    │              │    │   (PostgreSQL)   │   │
│  └─────────────┘    └──────────────┘    └────────┬─────────┘   │
│                                                   │             │
│  ┌─────────────┐    ┌──────────────┐    ┌────────▼─────────┐   │
│  │ APScheduler │───►│ Priority     │───►│   trafilatura    │   │
│  │             │    │ Calculator   │    │   (extraction)   │   │
│  └─────────────┘    └──────────────┘    └────────┬─────────┘   │
│                                                   │             │
│                      ┌───────────────────────────┴──────────┐  │
│                      │        Content Processing            │  │
│                      │  • spaCy NER + Fighter Resolution    │  │
│                      │  • GPT-4o-mini Classification        │  │
│                      │  • Content Hashing (dedup)           │  │
│                      │  • Chunking (512 tokens)             │  │
│                      └───────────────────────────┬──────────┘  │
│                                                   │             │
│                      ┌───────────────────────────▼──────────┐  │
│                      │     Voyage AI / OpenAI Batch API     │  │
│                      │     text-embedding-3-small (512d)    │  │
│                      └───────────────────────────┬──────────┘  │
│                                                   │             │
│  ┌───────────────────────────────────────────────▼──────────┐  │
│  │              PostgreSQL + pgvector                       │  │
│  │  • chunks table (embedding, tsv, content_hash)           │  │
│  │  • fighters table (aliases, upcoming_fight_date)         │  │
│  │  • job_queue (SKIP LOCKED processing)                    │  │
│  │  • Hybrid search: RRF(semantic + BM25) × time_decay      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Technology stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Orchestration** | APScheduler | Zero infra, PostgreSQL job store |
| **Extraction** | trafilatura | Highest F1 (0.958), metadata extraction |
| **NER** | spaCy + EntityRuler | Custom fighter patterns, fuzzy fallback |
| **Embeddings** | Voyage AI → OpenAI Batch | Free tier → $0.01/1M backup |
| **Database** | PostgreSQL + pgvector | Single DB for everything |
| **Full-text** | tsvector + ts_rank_cd | Native, no Elasticsearch needed |
| **RSS** | feedparser | Mature, handles edge cases |

### Estimated monthly costs

| Component | Conservative | High Volume |
|-----------|--------------|-------------|
| Embeddings (Voyage free tier) | $0 | $0 |
| Whisper (2 podcasts/week) | $3 | $5 |
| GPT-4o-mini classification | $0.50 | $2 |
| PostgreSQL (managed) | $5-15 | $15-25 |
| **Total** | **$8-18** | **$22-32** |

With Voyage AI's 200M free token tier, you can operate for several months at zero embedding cost before needing to pay.

---

## Implementation sequence

1. **Week 1**: Set up PostgreSQL with pgvector, import Kaggle historical dataset
2. **Week 2**: Build RSS ingestion with feedparser + trafilatura extraction
3. **Week 3**: Implement fighter NER with spaCy EntityRuler and alias table
4. **Week 4**: Add embedding generation with content hashing deduplication
5. **Week 5**: Configure hybrid search with RRF and time-decay weighting
6. **Week 6**: Build APScheduler jobs with priority-based fighter polling

This architecture handles your UFC-focused prediction system requirements while maintaining legal compliance and keeping costs under $25/month even at scale.