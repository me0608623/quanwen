import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const rewardTypeEnum = pgEnum('reward_type', [
  'cash',    // NT$ 現金獎勵（預設）
  'points',  // 平台積分（1 積分 = NT$0.5，不可換現金）
]);

export const surveyStatusEnum = pgEnum('survey_status', [
  'draft',       // 草稿，問券方編輯中
  'pending_review', // 送出待 AI 審核
  'published',   // 上架，受試者可填
  'paused',      // 暫停接案
  'closed',      // 截止/已達配額
  'rejected',    // AI 審核不通過
]);

export const questionTypeEnum = pgEnum('question_type', [
  'single_choice',   // 單選
  'multiple_choice', // 多選
  'text',            // 開放式文字
  'rating',          // 評分（1-N）
  'matrix',          // 矩陣題
]);

// 問卷類型：standard 走獎勵媒合，mutual 走互惠配對
export const surveyTypeEnum = pgEnum('survey_type', [
  'standard',
  'mutual',
]);

// 問卷分類（給 task list 篩選 + mutual 智慧媒合用）
export const surveyCategoryEnum = pgEnum('survey_category', [
  'consumer',
  'academic',
  'wellness',
  'workplace',
  'lifestyle',
  'tech',
  'social',
  'education',
  'finance',
  'other',
]);

// ─── Surveys ──────────────────────────────────────────────────────────────────

export const surveys = pgTable(
  'surveys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surveyorId: uuid('surveyor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    status: surveyStatusEnum('status').notNull().default('draft'),
    // standard | mutual。mutual 不走獎勵媒合，靠互惠配對解鎖
    type: surveyTypeEnum('type').notNull().default('standard'),
    // 分類(optional): 提供 task list 過濾 + 未來 mutual 智慧媒合
    category: surveyCategoryEnum('category'),
    // Phase C-2: 發問卷方可決定要不要導入 AI 品質審核 (standard 才有意義)
    aiReviewEnabled: boolean('ai_review_enabled').notNull().default(true),
    // Phase C-3: 外部平台連結 (Google Forms / SurveyMonkey 等)。
    // 非空 → 此問卷不在站內填答，填答者改為「跳轉至外部頁面」(standard 與 mutual 皆適用)
    externalUrl: text('external_url'),
    // 建立者填寫的預估填答時間 (分鐘)。外部問卷無題目可自動估算時必填，站內問卷可選填覆寫自動估算
    estimatedMinutes: integer('estimated_minutes'),

    // 獎勵設定
    rewardType: rewardTypeEnum('reward_type').notNull().default('cash'),
    // cash → NT$ 每份金額；points → 每份積分數量
    rewardPoints: integer('reward_points').notNull().default(0),
    // fixed → 每份固定獎勵；lottery → 有效填答者參加抽獎
    rewardMode: varchar('reward_mode', { length: 16 }).notNull().default('fixed'),
    lotteryPrize: text('lottery_prize'),
    lotteryWinnerCount: integer('lottery_winner_count'),
    // when_full → 收滿自動開獎；scheduled → 指定日期；manual → 收滿後建立者手動開獎
    lotteryDrawMode: varchar('lottery_draw_mode', { length: 16 }),
    lotteryDrawAt: timestamp('lottery_draw_at', { withTimezone: true }),
    lotteryDrawnAt: timestamp('lottery_drawn_at', { withTimezone: true }),
    lotteryDrawSeed: text('lottery_draw_seed'),
    lotteryEligibleDigest: text('lottery_eligible_digest'),
    lotteryTermsAcceptedAt: timestamp('lottery_terms_accepted_at', { withTimezone: true }),
    lotteryObligationNotifiedAt: timestamp('lottery_obligation_notified_at', { withTimezone: true }),

    // QUA-34: Rush delivery — 4-tier deadline system
    // standard=14d/1.0x | express=7d/1.2x | urgent=3d/1.5x | critical=24h/1.75x
    deadlineTier: varchar('deadline_tier', { length: 16 }).notNull().default('standard'),
    // baseRewardPoints = original reward before rush multiplier; rewardPoints = inflated effective value
    baseRewardPoints: integer('base_reward_points').notNull().default(0),

    // 受眾條件（JSON，儲存篩選規則）
    audienceCriteria: jsonb('audience_criteria'),

    // 配額與期限
    targetCount: integer('target_count').notNull().default(100),
    completedCount: integer('completed_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    // AI 審核結果
    aiScore: integer('ai_score'),           // 0-100
    aiRejectReason: text('ai_reject_reason'),

    // QUA-204: 問券層級題目順序隨機化 ('none' | 'all' | 'exceptLast')
    questionShuffleMode: varchar('question_shuffle_mode', { length: 16 }).notNull().default('none'),

    // QUA-279: 問卷封面圖片（顯示在任務列表卡片背景）
    coverImageUrl: text('cover_image_url'),

    // 歡迎頁（作答第一頁）可插入的多張圖片，依陣列順序顯示於描述之後
    welcomeImages: jsonb('welcome_images').$type<string[]>(),

    // 樣式主題（JSON）：accentColor / backgroundColor / fontFamily，套用到填答頁與預覽
    theme: jsonb('theme'),

    // 是否允許匿名填答
    isAnonymous: boolean('is_anonymous').notNull().default(true),

    // QUA-201: Scheduled publish and auto-close
    scheduledPublishAt: timestamp('scheduled_publish_at', { withTimezone: true }),
    autoCloseAt: timestamp('auto_close_at', { withTimezone: true }),
    autoCloseAfterN: integer('auto_close_after_n'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => ({
    surveyorIdx: index('surveys_surveyor_idx').on(t.surveyorId),
    statusIdx: index('surveys_status_idx').on(t.status),
    expiresIdx: index('surveys_expires_idx').on(t.expiresAt),
    // P6: task list 熱查詢 WHERE status=? AND type=? ORDER BY reward_points DESC, published_at DESC
    // (responses.service.getAvailableSurveys / getCategoryCounts)。複合索引避免 published
    //  全表掃再以 type 過濾;category 索引給分類別篩選用。
    statusTypeIdx: index('surveys_status_type_idx').on(t.status, t.type),
    categoryIdx: index('surveys_category_idx').on(t.category),
  }),
);

// ─── Survey Questions ─────────────────────────────────────────────────────────

export const surveyQuestions = pgTable(
  'survey_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    surveyId: uuid('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
    type: questionTypeEnum('type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    isRequired: boolean('is_required').notNull().default(true),
    // QUA-279: 題目圖片
    imageUrl: text('image_url'),
    // 題型設定（rating 用 max_rating；matrix 用 row/col 設定）
    config: jsonb('config'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    surveyIdx: index('survey_questions_survey_idx').on(t.surveyId),
    orderIdx: index('survey_questions_order_idx').on(t.surveyId, t.sortOrder),
  }),
);

// ─── Question Options ─────────────────────────────────────────────────────────

export const questionOptions = pgTable(
  'question_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionId: uuid('question_id').notNull().references(() => surveyQuestions.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 300 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => ({
    questionIdx: index('question_options_question_idx').on(t.questionId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Survey = typeof surveys.$inferSelect;
export type NewSurvey = typeof surveys.$inferInsert;
export type SurveyQuestion = typeof surveyQuestions.$inferSelect;
export type NewSurveyQuestion = typeof surveyQuestions.$inferInsert;
export type QuestionOption = typeof questionOptions.$inferSelect;
export type NewQuestionOption = typeof questionOptions.$inferInsert;
