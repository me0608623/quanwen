-- QUA-34: Rush delivery tier — 4-tier deadline system with pricing multiplier
-- Tiers confirmed by CEO (2026-05-30):
--   standard  (14d): 1.00x — no surcharge
--   express   (7d):  1.20x — +20%
--   urgent    (3d):  1.50x — +50%
--   critical  (24h): 1.75x — +75%, full refund if target not reached

ALTER TABLE surveys ADD COLUMN IF NOT EXISTS deadline_tier VARCHAR(16) NOT NULL DEFAULT 'standard'
  CHECK (deadline_tier IN ('standard','express','urgent','critical'));

-- base_reward_points stores the unmodified per-response reward before rush multiplier is applied.
-- reward_points continues to hold the effective (inflated) value used for budget locking and payout.
ALTER TABLE surveys ADD COLUMN IF NOT EXISTS base_reward_points INTEGER NOT NULL DEFAULT 0;
