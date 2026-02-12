-- Create KV store table for Prompt Crit
CREATE TABLE IF NOT EXISTS kv_store_5742cd96 (
  key TEXT NOT NULL PRIMARY KEY,
  value JSONB NOT NULL
);

-- Create index for prefix searches
CREATE INDEX IF NOT EXISTS idx_kv_store_key_prefix ON kv_store_5742cd96 (key text_pattern_ops);
