CREATE UNIQUE INDEX IF NOT EXISTS transactions_related_response_type_unique
  ON transactions (related_response_id, type)
  WHERE related_response_id IS NOT NULL;
