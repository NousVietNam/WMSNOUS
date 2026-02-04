-- Migration to add telegram_chat_id to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- Index for searching (optional but good for lookups)
CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id ON users(telegram_chat_id);
