-- Reverses 20251214_add_pgvector_embeddings.
-- The hybrid retrieval / RAG pipeline is no longer wired into the prediction
-- path; nothing reads or writes these objects in the active codebase.
-- The `vector` extension itself is intentionally left installed.

-- 1. Functions first — they reference fighter_context_chunks and the vector
--    columns we're about to drop. Prod has both INT and BIGINT overloads of
--    get_fighter_context_with_decay (the second one was added via a manual
--    SQL patch); both signatures are dropped.
DROP FUNCTION IF EXISTS get_fighter_context_with_decay(
  TEXT, vector, TEXT[], INT, INT
);
DROP FUNCTION IF EXISTS get_fighter_context_with_decay(
  TEXT, vector, TEXT[], BIGINT, BIGINT
);
DROP FUNCTION IF EXISTS hybrid_fighter_search(
  TEXT, vector, INT, INT
);

-- 2. Drop the context-chunks table. Its indexes drop with it. The FK from
--    fighter_id was ON DELETE CASCADE, so existing fighter rows are unaffected.
DROP TABLE IF EXISTS fighter_context_chunks;

-- 3. Drop the embedding index and full-text search index on fighters.
DROP INDEX IF EXISTS fighters_embedding_idx;
DROP INDEX IF EXISTS fighters_search_idx;

-- 4. Drop the embedding/RAG columns on fighters.
--    search_vector is a generated column that depends on profile_text — drop
--    it before profile_text. profile_embedding is the vector column.
ALTER TABLE fighters DROP COLUMN IF EXISTS search_vector;
ALTER TABLE fighters DROP COLUMN IF EXISTS profile_embedding;
ALTER TABLE fighters DROP COLUMN IF EXISTS embedding_updated_at;
ALTER TABLE fighters DROP COLUMN IF EXISTS profile_text;
