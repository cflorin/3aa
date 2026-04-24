-- EPIC-004/STORY-046: Add user_deactivated_stocks table
-- All-default-monitored model: no row = active; row = deactivated by that user
-- RFC-003 §Monitor List API (model updated 2026-04-23); ADR-007

CREATE TABLE user_deactivated_stocks (
  user_id        UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  ticker         VARCHAR(10) NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  deactivated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, ticker)
);

CREATE INDEX idx_user_deactivated_stocks_user_id ON user_deactivated_stocks(user_id);
CREATE INDEX idx_user_deactivated_stocks_ticker  ON user_deactivated_stocks(ticker);
