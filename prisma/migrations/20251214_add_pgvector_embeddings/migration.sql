-- Enable pgvector extension (pre-installed in Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns to fighters table
-- Using 1536 dimensions (OpenAI text-embedding-3-small)
ALTER TABLE fighters ADD COLUMN IF NOT EXISTS profile_embedding vector(1536);
ALTER TABLE fighters ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP;
ALTER TABLE fighters ADD COLUMN IF NOT EXISTS profile_text TEXT;

-- Create HNSW index for fast approximate nearest neighbor search
-- m=16, ef_construction=64 are good defaults for small-medium datasets
CREATE INDEX IF NOT EXISTS fighters_embedding_idx
ON fighters USING hnsw (profile_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create full-text search index for BM25-style keyword matching
-- Combines name, nickname, weight class, and profile text
ALTER TABLE fighters ADD COLUMN IF NOT EXISTS search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(nickname, '')), 'B') ||
  setweight(to_tsvector('english', coalesce("weightClass", '')), 'C') ||
  setweight(to_tsvector('english', coalesce(profile_text, '')), 'D')
) STORED;

CREATE INDEX IF NOT EXISTS fighters_search_idx ON fighters USING gin(search_vector);

-- Create a table for storing fighter context chunks (news, analysis, etc.)
-- This allows for more granular retrieval
CREATE TABLE IF NOT EXISTS fighter_context_chunks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fighter_id TEXT NOT NULL REFERENCES fighters(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL, -- 'news', 'analysis', 'fight_history', 'training_camp'
  source_url TEXT,
  published_at TIMESTAMP,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP, -- For time-sensitive content like news

  -- Full-text search
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', content)
  ) STORED
);

-- Indexes for context chunks
CREATE INDEX IF NOT EXISTS context_chunks_fighter_idx ON fighter_context_chunks(fighter_id);
CREATE INDEX IF NOT EXISTS context_chunks_type_idx ON fighter_context_chunks(content_type);
CREATE INDEX IF NOT EXISTS context_chunks_embedding_idx
ON fighter_context_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS context_chunks_search_idx ON fighter_context_chunks USING gin(search_vector);
CREATE INDEX IF NOT EXISTS context_chunks_expires_idx ON fighter_context_chunks(expires_at);

-- Function for hybrid search with Reciprocal Rank Fusion (RRF)
-- k=60 is the standard RRF constant (no tuning needed)
CREATE OR REPLACE FUNCTION hybrid_fighter_search(
  query_text TEXT,
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  fighter_id TEXT,
  fighter_name TEXT,
  weight_class TEXT,
  rrf_score FLOAT,
  vector_rank INT,
  text_rank INT
) AS $$
WITH vector_search AS (
  SELECT
    id,
    name,
    "weightClass",
    ROW_NUMBER() OVER (ORDER BY profile_embedding <=> query_embedding) as rank
  FROM fighters
  WHERE profile_embedding IS NOT NULL
  ORDER BY profile_embedding <=> query_embedding
  LIMIT match_count * 2
),
text_search AS (
  SELECT
    id,
    name,
    "weightClass",
    ROW_NUMBER() OVER (ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', query_text)) DESC) as rank
  FROM fighters
  WHERE search_vector @@ websearch_to_tsquery('english', query_text)
  ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', query_text)) DESC
  LIMIT match_count * 2
)
SELECT
  COALESCE(v.id, t.id) as fighter_id,
  COALESCE(v.name, t.name) as fighter_name,
  COALESCE(v."weightClass", t."weightClass") as weight_class,
  -- RRF score: sum of 1/(k + rank) for each search method
  COALESCE(1.0 / (rrf_k + v.rank), 0) + COALESCE(1.0 / (rrf_k + t.rank), 0) as rrf_score,
  COALESCE(v.rank::INT, 0) as vector_rank,
  COALESCE(t.rank::INT, 0) as text_rank
FROM vector_search v
FULL OUTER JOIN text_search t ON v.id = t.id
ORDER BY rrf_score DESC
LIMIT match_count;
$$ LANGUAGE SQL STABLE;

-- Function for context chunk retrieval with time decay
CREATE OR REPLACE FUNCTION get_fighter_context_with_decay(
  p_fighter_id TEXT,
  p_query_embedding vector(1536),
  p_content_types TEXT[] DEFAULT ARRAY['news', 'analysis', 'fight_history'],
  p_max_age_days INT DEFAULT 180,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  chunk_id TEXT,
  content TEXT,
  content_type TEXT,
  source_url TEXT,
  published_at TIMESTAMP,
  relevance_score FLOAT,
  recency_score FLOAT,
  combined_score FLOAT
) AS $$
SELECT
  id as chunk_id,
  fc.content,
  fc.content_type,
  fc.source_url,
  fc.published_at,
  -- Cosine similarity (1 - distance) as relevance
  1 - (fc.embedding <=> p_query_embedding) as relevance_score,
  -- Exponential decay based on content type half-life
  CASE fc.content_type
    WHEN 'news' THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (30 * 86400))  -- 30 day half-life
    WHEN 'training_camp' THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (30 * 86400))  -- 30 day half-life
    WHEN 'analysis' THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (90 * 86400))  -- 90 day half-life
    WHEN 'fight_history' THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (180 * 86400)) -- 180 day half-life
    ELSE EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (365 * 86400)) -- 365 day half-life default
  END as recency_score,
  -- Combined score: relevance * recency
  (1 - (fc.embedding <=> p_query_embedding)) *
  CASE fc.content_type
    WHEN 'news' THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (30 * 86400))
    WHEN 'training_camp' THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (30 * 86400))
    WHEN 'analysis' THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (90 * 86400))
    WHEN 'fight_history' THEN EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (180 * 86400))
    ELSE EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.published_at, fc.created_at))) / (365 * 86400))
  END as combined_score
FROM fighter_context_chunks fc
WHERE
  fc.fighter_id = p_fighter_id
  AND fc.content_type = ANY(p_content_types)
  AND (fc.expires_at IS NULL OR fc.expires_at > NOW())
  AND fc.created_at > NOW() - (p_max_age_days || ' days')::INTERVAL
  AND fc.embedding IS NOT NULL
ORDER BY combined_score DESC
LIMIT p_limit;
$$ LANGUAGE SQL STABLE;
