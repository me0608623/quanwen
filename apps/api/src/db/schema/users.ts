import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['surveyor', 'respondent', 'admin']);

export const authProviderEnum = pgEnum('auth_provider', ['email', 'google', 'line', 'apple']);

export const userStatusEnum = pgEnum('user_status', ['active', 'suspended', 'pending_verify']);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }),
    role: userRoleEnum('role').notNull(),
    status: userStatusEnum('status').notNull().default('active'),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    avatarUrl: text('avatar_url'),
    emailVerified: boolean('email_verified').notNull().default(false),
    passwordResetToken: varchar('password_reset_token', { length: 128 }),
    passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
    emailVerificationToken: varchar('email_verification_token', { length: 128 }),
    emailVerificationExpiresAt: timestamp('email_verification_expires_at', { withTimezone: true }),
    roleSelectedAt: timestamp('role_selected_at', { withTimezone: true }),
    emailOptOut: boolean('email_opt_out').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: index('users_email_idx').on(t.email),
    roleIdx: index('users_role_idx').on(t.role),
    statusIdx: index('users_status_idx').on(t.status),
    resetTokenIdx: index('users_password_reset_token_idx').on(t.passwordResetToken),
    verifyTokenIdx: index('users_email_verification_token_idx').on(t.emailVerificationToken),
  }),
);

// ─── OAuth Accounts ───────────────────────────────────────────────────────────

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProviderEnum('provider').notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    providerEmail: varchar('provider_email', { length: 255 }),
    providerAvatarUrl: text('provider_avatar_url'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerAccountIdx: index('oauth_accounts_provider_account_idx').on(
      t.provider,
      t.providerAccountId,
    ),
    userIdx: index('oauth_accounts_user_idx').on(t.userId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;
export type NewOAuthAccount = typeof oauthAccounts.$inferInsert;
