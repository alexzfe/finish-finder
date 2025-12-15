CREATE OR REPLACE FUNCTION get_fighter_context_with_decay(
  p_fighter_id TEXT,
  p_query_embedding vector(1536),
  p_content_types TEXT[],
  p_max_age_days BIGINT,
  p_limit BIGINT
)
RETURNS TABLE (
  chunk_id TEXT,
  content TEXT,
  content_type TEXT,
  source_url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  relevance_score DOUBLE PRECISION,
  recency_score DOUBLE PRECISION,
  combined_score DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
  v_cutoff_date := NOW() - (p_max_age_days || ' days')::INTERVAL;

  RETURN QUERY
  WITH chunk_scores AS (
    SELECT
      fcc.id AS chunk_id,
      fcc.content,
      fcc.content_type,
      fcc.source_url,
      fcc.published_at::TIMESTAMP WITH TIME ZONE AS published_at,
      (CASE
        WHEN fcc.embedding IS NOT NULL THEN
          (1.0 - (fcc.embedding <=> p_query_embedding))::DOUBLE PRECISION
        ELSE 0.5::DOUBLE PRECISION
      END) AS relevance_score,
      (CASE
        WHEN fcc.published_at IS NULL THEN 0.5::DOUBLE PRECISION
        ELSE (EXP(
          -0.693 * EXTRACT(EPOCH FROM (NOW() - fcc.published_at)) / 86400.0 /
          CASE fcc.content_type
            WHEN 'news' THEN 30.0
            WHEN 'training_camp' THEN 30.0
            WHEN 'analysis' THEN 90.0
            WHEN 'injury' THEN 90.0
            WHEN 'fight_history' THEN 180.0
            WHEN 'career_stats' THEN 365.0
            ELSE 90.0
          END
        ))::DOUBLE PRECISION
      END) AS recency_score
    FROM fighter_context_chunks fcc
    WHERE fcc.fighter_id = p_fighter_id
      AND fcc.content_type = ANY(p_content_types)
      AND (fcc.published_at IS NULL OR fcc.published_at >= v_cutoff_date)
      AND (fcc.expires_at IS NULL OR fcc.expires_at > NOW())
  )
  SELECT
    cs.chunk_id,
    cs.content,
    cs.content_type,
    cs.source_url,
    cs.published_at,
    cs.relevance_score,
    cs.recency_score,
    (0.7 * cs.relevance_score + 0.3 * cs.recency_score)::DOUBLE PRECISION AS combined_score
  FROM chunk_scores cs
  ORDER BY combined_score DESC
  LIMIT p_limit;
END;
$$;
