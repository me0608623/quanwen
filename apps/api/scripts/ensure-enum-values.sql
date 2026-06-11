-- Idempotent enum value alignment for Neon (production Postgres).
--
-- drizzle-kit push creates new enum types but DOES NOT apply ALTER TYPE ... ADD VALUE
-- for values added to existing enums. This script closes that gap.
--
-- Run after every drizzle-kit push in CI. All statements use IF NOT EXISTS, so
-- re-running is safe and has no side effects.
--
-- Maintenance: when you add a value to a pgEnum in apps/api/src/db/schema/*.ts,
-- also add the corresponding ALTER TYPE line here (plus update database.module.ts
-- and test-helpers/pglite-ddl.ts as described in CLAUDE.md).

-- ── transaction_type ──────────────────────────────────────────────────────────
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'deposit';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'reward_out';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'reward_in';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'platform_fee';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'withdraw_request';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'withdraw_complete';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'refund';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'points_in';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'points_spend';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'admin_adjustment';

-- ── transaction_status ────────────────────────────────────────────────────────
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'success';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ── user_role ─────────────────────────────────────────────────────────────────
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'surveyor';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'respondent';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';

-- ── auth_provider ─────────────────────────────────────────────────────────────
ALTER TYPE auth_provider ADD VALUE IF NOT EXISTS 'email';
ALTER TYPE auth_provider ADD VALUE IF NOT EXISTS 'google';
ALTER TYPE auth_provider ADD VALUE IF NOT EXISTS 'line';
ALTER TYPE auth_provider ADD VALUE IF NOT EXISTS 'apple';

-- ── user_status ───────────────────────────────────────────────────────────────
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'pending_verify';

-- ── user_tier ─────────────────────────────────────────────────────────────────
ALTER TYPE user_tier ADD VALUE IF NOT EXISTS 'free';
ALTER TYPE user_tier ADD VALUE IF NOT EXISTS 'vip';
ALTER TYPE user_tier ADD VALUE IF NOT EXISTS 'vvip';

-- ── reward_type ───────────────────────────────────────────────────────────────
ALTER TYPE reward_type ADD VALUE IF NOT EXISTS 'cash';
ALTER TYPE reward_type ADD VALUE IF NOT EXISTS 'points';

-- ── survey_status ─────────────────────────────────────────────────────────────
ALTER TYPE survey_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE survey_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE survey_status ADD VALUE IF NOT EXISTS 'published';
ALTER TYPE survey_status ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE survey_status ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE survey_status ADD VALUE IF NOT EXISTS 'rejected';

-- ── question_type ─────────────────────────────────────────────────────────────
ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'single_choice';
ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'multiple_choice';
ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'text';
ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'rating';
ALTER TYPE question_type ADD VALUE IF NOT EXISTS 'matrix';

-- ── survey_type ───────────────────────────────────────────────────────────────
ALTER TYPE survey_type ADD VALUE IF NOT EXISTS 'standard';
ALTER TYPE survey_type ADD VALUE IF NOT EXISTS 'mutual';

-- ── survey_category ───────────────────────────────────────────────────────────
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'consumer';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'academic';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'wellness';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'workplace';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'lifestyle';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'tech';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'social';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'education';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE survey_category ADD VALUE IF NOT EXISTS 'other';

-- ── tag_category ──────────────────────────────────────────────────────────────
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'tech';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'lifestyle';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'health';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'entertainment';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'food';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'travel';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'education';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'society';
ALTER TYPE tag_category ADD VALUE IF NOT EXISTS 'other';

-- ── age_range ─────────────────────────────────────────────────────────────────
ALTER TYPE age_range ADD VALUE IF NOT EXISTS 'under_18';
ALTER TYPE age_range ADD VALUE IF NOT EXISTS '18_24';
ALTER TYPE age_range ADD VALUE IF NOT EXISTS '25_34';
ALTER TYPE age_range ADD VALUE IF NOT EXISTS '35_44';
ALTER TYPE age_range ADD VALUE IF NOT EXISTS '45_54';
ALTER TYPE age_range ADD VALUE IF NOT EXISTS '55_plus';

-- ── gender ────────────────────────────────────────────────────────────────────
ALTER TYPE gender ADD VALUE IF NOT EXISTS 'male';
ALTER TYPE gender ADD VALUE IF NOT EXISTS 'female';
ALTER TYPE gender ADD VALUE IF NOT EXISTS 'non_binary';
ALTER TYPE gender ADD VALUE IF NOT EXISTS 'prefer_not_to_say';

-- ── occupation ────────────────────────────────────────────────────────────────
ALTER TYPE occupation ADD VALUE IF NOT EXISTS 'student';
ALTER TYPE occupation ADD VALUE IF NOT EXISTS 'employed_full_time';
ALTER TYPE occupation ADD VALUE IF NOT EXISTS 'employed_part_time';
ALTER TYPE occupation ADD VALUE IF NOT EXISTS 'self_employed';
ALTER TYPE occupation ADD VALUE IF NOT EXISTS 'unemployed';
ALTER TYPE occupation ADD VALUE IF NOT EXISTS 'retired';
ALTER TYPE occupation ADD VALUE IF NOT EXISTS 'homemaker';
ALTER TYPE occupation ADD VALUE IF NOT EXISTS 'other';

-- ── industry ──────────────────────────────────────────────────────────────────
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'info_tech';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'manufacturing';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'engineering_construction';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'healthcare';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'education';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'legal';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'public_sector';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'service';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'food_beverage';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'hospitality_travel';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'retail_wholesale';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'transport_logistics';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'agriculture';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'arts_media';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'marketing_pr';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'nonprofit';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'freelance';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'student';
ALTER TYPE industry ADD VALUE IF NOT EXISTS 'other';

-- ── education ─────────────────────────────────────────────────────────────────
ALTER TYPE education ADD VALUE IF NOT EXISTS 'junior_high';
ALTER TYPE education ADD VALUE IF NOT EXISTS 'senior_high';
ALTER TYPE education ADD VALUE IF NOT EXISTS 'vocational';
ALTER TYPE education ADD VALUE IF NOT EXISTS 'bachelor';
ALTER TYPE education ADD VALUE IF NOT EXISTS 'master';
ALTER TYPE education ADD VALUE IF NOT EXISTS 'phd';
ALTER TYPE education ADD VALUE IF NOT EXISTS 'other';

-- ── response_notif_mode ───────────────────────────────────────────────────────
ALTER TYPE response_notif_mode ADD VALUE IF NOT EXISTS 'per_response';
ALTER TYPE response_notif_mode ADD VALUE IF NOT EXISTS 'daily_digest';

-- ── response_status ───────────────────────────────────────────────────────────
ALTER TYPE response_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE response_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE response_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE response_status ADD VALUE IF NOT EXISTS 'rewarded';
ALTER TYPE response_status ADD VALUE IF NOT EXISTS 'rejected';

-- ── response_sentiment ────────────────────────────────────────────────────────
ALTER TYPE response_sentiment ADD VALUE IF NOT EXISTS 'positive';
ALTER TYPE response_sentiment ADD VALUE IF NOT EXISTS 'neutral';
ALTER TYPE response_sentiment ADD VALUE IF NOT EXISTS 'negative';

-- ── appeal_status ─────────────────────────────────────────────────────────────
ALTER TYPE appeal_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE appeal_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE appeal_status ADD VALUE IF NOT EXISTS 'dismissed';

-- ── kyc_status ────────────────────────────────────────────────────────────────
ALTER TYPE kyc_status ADD VALUE IF NOT EXISTS 'unverified';
ALTER TYPE kyc_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE kyc_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE kyc_status ADD VALUE IF NOT EXISTS 'rejected';

-- ── mutual_pair_status ────────────────────────────────────────────────────────
ALTER TYPE mutual_pair_status ADD VALUE IF NOT EXISTS 'waiting';
ALTER TYPE mutual_pair_status ADD VALUE IF NOT EXISTS 'matched';
ALTER TYPE mutual_pair_status ADD VALUE IF NOT EXISTS 'a_done';
ALTER TYPE mutual_pair_status ADD VALUE IF NOT EXISTS 'b_done';
ALTER TYPE mutual_pair_status ADD VALUE IF NOT EXISTS 'both_done';
ALTER TYPE mutual_pair_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE mutual_pair_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ── notification_type ─────────────────────────────────────────────────────────
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'survey_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'survey_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_response';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'response_milestone';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'daily_response_digest';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reward_issued';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'system';

-- ── pending_notification_status ───────────────────────────────────────────────
ALTER TYPE pending_notification_status ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE pending_notification_status ADD VALUE IF NOT EXISTS 'done';
ALTER TYPE pending_notification_status ADD VALUE IF NOT EXISTS 'failed';

-- ── shop_item_category ────────────────────────────────────────────────────────
ALTER TYPE shop_item_category ADD VALUE IF NOT EXISTS 'voucher_711';
ALTER TYPE shop_item_category ADD VALUE IF NOT EXISTS 'voucher_familymart';
ALTER TYPE shop_item_category ADD VALUE IF NOT EXISTS 'voucher_starbucks';
ALTER TYPE shop_item_category ADD VALUE IF NOT EXISTS 'voucher_general';
ALTER TYPE shop_item_category ADD VALUE IF NOT EXISTS 'merchandise';

-- ── redemption_status ─────────────────────────────────────────────────────────
ALTER TYPE redemption_status ADD VALUE IF NOT EXISTS 'issued';
ALTER TYPE redemption_status ADD VALUE IF NOT EXISTS 'used';
ALTER TYPE redemption_status ADD VALUE IF NOT EXISTS 'expired';
ALTER TYPE redemption_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ── logic_condition ───────────────────────────────────────────────────────────
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'eq';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'neq';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'gt';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'gte';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'lt';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'lte';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'contains';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'not_contains';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'is_empty';
ALTER TYPE logic_condition ADD VALUE IF NOT EXISTS 'is_not_empty';

-- ── logic_action ──────────────────────────────────────────────────────────────
ALTER TYPE logic_action ADD VALUE IF NOT EXISTS 'show';
ALTER TYPE logic_action ADD VALUE IF NOT EXISTS 'hide';
ALTER TYPE logic_action ADD VALUE IF NOT EXISTS 'skip';
