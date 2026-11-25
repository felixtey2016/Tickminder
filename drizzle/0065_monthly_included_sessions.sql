-- NULL preserves the meaning of existing monthly prices. New monthly versions
-- require an explicit allowance in the API; never invent a default for history.
ALTER TABLE billing_rate_versions ADD COLUMN included_sessions INTEGER
  CHECK (included_sessions IS NULL OR
    (mode = 'month' AND typeof(included_sessions) = 'integer' AND included_sessions BETWEEN 1 AND 62));
