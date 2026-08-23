DELETE FROM anonymous_generations
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY ip_hash
        ORDER BY generated_at DESC, id DESC
      ) AS duplicate_rank
    FROM anonymous_generations
  )
  WHERE duplicate_rank > 1
);

DROP INDEX IF EXISTS anonymous_generations_ip_hash_idx;
CREATE UNIQUE INDEX IF NOT EXISTS anonymous_generations_ip_hash_uidx
  ON anonymous_generations (ip_hash);
