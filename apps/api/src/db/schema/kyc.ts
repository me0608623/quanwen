import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const kycStatusEnum = pgEnum('kyc_status', [
  'unverified',  // 初始
  'submitted',   // 已上傳資料，待 admin 審
  'approved',    // 已核准
  'rejected',    // 駁回，需重交
]);

// ─── KYC Verifications ────────────────────────────────────────────────────────
// Phase B：受試者領 > NT$2,000 強制 KYC
//   PII 欄位（id_number, real_name）皆以 CryptoService AES-256-GCM 加密儲存

export const kycVerifications = pgTable(
  'kyc_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    status: kycStatusEnum('status').notNull().default('unverified'),

    // PII（加密儲存，存的是 v1:iv:tag:ct 自描述密文）
    idNumberCipher: text('id_number_cipher'),       // 身分證號
    realNameCipher: text('real_name_cipher'),       // 真實姓名
    phoneCipher: text('phone_cipher'),              // 手機號

    // 證件影像 URL（指向加密儲存桶；URL 本身不算 PII）
    idFrontUrl: varchar('id_front_url', { length: 500 }),
    idBackUrl: varchar('id_back_url', { length: 500 }),
    selfieUrl: varchar('selfie_url', { length: 500 }),

    // 審核結果
    adminNote: varchar('admin_note', { length: 500 }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('kyc_verifications_status_idx').on(t.status),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type KycVerification = typeof kycVerifications.$inferSelect;
export type NewKycVerification = typeof kycVerifications.$inferInsert;
