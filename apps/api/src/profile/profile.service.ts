import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  respondentProfiles,
  surveyorProfiles,
  respondentTags,
  interestTags,
} from '../db/schema';
import type { UpdateRespondentProfileDto } from './dto/update-respondent-profile.dto';
import type { UpdateSurveyorProfileDto } from './dto/update-surveyor-profile.dto';

@Injectable()
export class ProfileService {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async getRespondentProfile(userId: string) {
    const rows = await this.db
      .select()
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, userId))
      .limit(1);

    if (rows.length === 0) return null;

    const profile = rows[0];
    const tags = await this.db
      .select({ id: interestTags.id, name: interestTags.name, category: interestTags.category })
      .from(respondentTags)
      .innerJoin(interestTags, eq(respondentTags.tagId, interestTags.id))
      .where(eq(respondentTags.respondentProfileId, profile.id));

    return { ...profile, tags };
  }

  async getSurveyorProfile(userId: string) {
    const rows = await this.db
      .select()
      .from(surveyorProfiles)
      .where(eq(surveyorProfiles.userId, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async upsertRespondentProfile(userId: string, dto: UpdateRespondentProfileDto) {
    const existing = await this.db
      .select({ id: respondentProfiles.id })
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, userId))
      .limit(1);

    const { tagIds, ...rest } = dto;
    // 行業選非「其他」時清掉自由填寫，避免殘留舊值
    const profileFields =
      rest.industry && rest.industry !== 'other'
        ? { ...rest, industryOther: null }
        : rest;
    const now = new Date();

    let profileId: string;

    if (existing.length === 0) {
      const inserted = await this.db
        .insert(respondentProfiles)
        .values({ userId, ...profileFields, isOnboardingDone: true, updatedAt: now })
        .returning({ id: respondentProfiles.id });
      profileId = inserted[0].id;
    } else {
      profileId = existing[0].id;
      await this.db
        .update(respondentProfiles)
        .set({ ...profileFields, isOnboardingDone: true, updatedAt: now })
        .where(eq(respondentProfiles.id, profileId));
    }

    if (tagIds !== undefined) {
      if (tagIds.length > 10) {
        throw new BadRequestException('最多選擇 10 個標籤');
      }

      await this.db
        .delete(respondentTags)
        .where(eq(respondentTags.respondentProfileId, profileId));

      if (tagIds.length > 0) {
        const validTags = await this.db
          .select({ id: interestTags.id })
          .from(interestTags)
          .where(inArray(interestTags.id, tagIds));

        const validIds = validTags.map((t) => t.id);
        if (validIds.length > 0) {
          await this.db.insert(respondentTags).values(
            validIds.map((tagId) => ({ respondentProfileId: profileId, tagId })),
          );
        }
      }
    }

    return this.getRespondentProfile(userId);
  }

  async upsertSurveyorProfile(userId: string, dto: UpdateSurveyorProfileDto) {
    const existing = await this.db
      .select({ id: surveyorProfiles.id })
      .from(surveyorProfiles)
      .where(eq(surveyorProfiles.userId, userId))
      .limit(1);

    const now = new Date();

    if (existing.length === 0) {
      await this.db
        .insert(surveyorProfiles)
        .values({ userId, ...dto, isOnboardingDone: true, updatedAt: now });
    } else {
      await this.db
        .update(surveyorProfiles)
        .set({ ...dto, isOnboardingDone: true, updatedAt: now })
        .where(eq(surveyorProfiles.id, existing[0].id));
    }

    const rows = await this.db
      .select()
      .from(surveyorProfiles)
      .where(eq(surveyorProfiles.userId, userId))
      .limit(1);

    return rows[0];
  }

  async getMyProfile(userId: string, role: string) {
    if (role === 'respondent') return this.getRespondentProfile(userId);
    if (role === 'surveyor') return this.getSurveyorProfile(userId);
    return null; // admin and other roles have no profile record
  }
}
