-- Required by document_chunks.embedding (pgvector). Must run before the schema
-- migration that creates the vector column.
CREATE EXTENSION IF NOT EXISTS vector;
