import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { respondentProfiles } from './profiles';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const tagCategoryEnum = pgEnum('tag_category', [
  'tech', 'lifestyle', 'finance', 'health', 'entertainment',
  'food', 'travel', 'education', 'society', 'other',
]);

// ─── Interest Tags ─────────────────────────────────────────────────────────────

export const interestTags = pgTable('interest_tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  category: tagCategoryEnum('category').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ─── Respondent → Tags (many-to-many) ─────────────────────────────────────────

export const respondentTags = pgTable(
  'respondent_tags',
  {
    respondentProfileId: uuid('respondent_profile_id')
      .notNull()
      .references(() => respondentProfiles.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => interestTags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.respondentProfileId, t.tagId] }),
    tagIdx: index('respondent_tags_tag_idx').on(t.tagId),
  }),
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type InterestTag = typeof interestTags.$inferSelect;
export type RespondentTag = typeof respondentTags.$inferSelect;
