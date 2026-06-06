import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { eq, desc, and } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { importAppeals, surveys, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ImportAppealsService {
  private readonly logger = new Logger(ImportAppealsService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
  ) {}

  /** 使用者提交匯入失敗申訴（貼問卷連結，請管理員協助匯入） */
  async submit(requesterId: string, dto: { surveyUrl: string; title?: string; note?: string }) {
    const url = dto.surveyUrl?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new BadRequestException('請提供有效的問卷連結（http/https）');
    }

    const [appeal] = await this.db
      .insert(importAppeals)
      .values({
        requesterId,
        surveyUrl: url.slice(0, 2000),
        title: dto.title?.trim().slice(0, 200) || null,
        note: dto.note?.trim().slice(0, 1000) || null,
      })
      .returning();

    // 通知所有管理員
    const admins = await this.db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    await Promise.all(
      admins.map((a) =>
        this.notifications
          .create({
            userId: a.id,
            type: 'system',
            title: '新的匯入失敗申訴',
            body: `有使用者請求協助匯入問卷：${dto.title?.trim() || url}`,
            metadata: { importAppealId: appeal.id, surveyUrl: url },
          })
          .catch((err) => this.logger.error('通知管理員失敗', err)),
      ),
    );

    return { message: '已送出申訴，管理員會盡快協助匯入，完成後會在「我的問卷」看到草稿', appeal };
  }

  /** 申請者查看自己的申訴 */
  async listMine(requesterId: string) {
    return this.db
      .select()
      .from(importAppeals)
      .where(eq(importAppeals.requesterId, requesterId))
      .orderBy(desc(importAppeals.createdAt));
  }

  /** 管理員列出申訴（預設 pending） */
  async listForAdmin(status?: string) {
    const rows = await this.db
      .select({
        id: importAppeals.id,
        requesterId: importAppeals.requesterId,
        requesterEmail: users.email,
        surveyUrl: importAppeals.surveyUrl,
        title: importAppeals.title,
        note: importAppeals.note,
        status: importAppeals.status,
        adminNote: importAppeals.adminNote,
        resolvedSurveyId: importAppeals.resolvedSurveyId,
        createdAt: importAppeals.createdAt,
        resolvedAt: importAppeals.resolvedAt,
      })
      .from(importAppeals)
      .leftJoin(users, eq(users.id, importAppeals.requesterId))
      .where(status ? eq(importAppeals.status, status) : undefined)
      .orderBy(desc(importAppeals.createdAt));
    return rows;
  }

  /**
   * 管理員處理：標記 resolved，並（預設）為申請者建立一份外部問卷草稿，
   * 帶入原連結與標題，讓申請者在「我的問卷」看到並可繼續編輯。
   */
  async resolve(appealId: string, adminId: string, dto: { createDraft?: boolean; adminNote?: string }) {
    const rows = await this.db.select().from(importAppeals).where(eq(importAppeals.id, appealId)).limit(1);
    const appeal = rows[0];
    if (!appeal) throw new NotFoundException('申訴不存在');
    if (appeal.status !== 'pending') throw new BadRequestException('此申訴已處理');

    let resolvedSurveyId: string | null = null;
    const createDraft = dto.createDraft !== false; // 預設建立草稿
    if (createDraft) {
      const [draft] = await this.db
        .insert(surveys)
        .values({
          surveyorId: appeal.requesterId,
          title: appeal.title || '匯入問卷（待補題目）',
          status: 'draft',
          type: 'standard',
          externalUrl: appeal.surveyUrl,
          rewardPoints: 0,
          targetCount: 100,
        })
        .returning({ id: surveys.id });
      resolvedSurveyId = draft.id;
    }

    await this.db
      .update(importAppeals)
      .set({
        status: 'resolved',
        adminNote: dto.adminNote?.slice(0, 500) ?? null,
        resolvedSurveyId,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      })
      .where(eq(importAppeals.id, appealId));

    await this.notifications
      .create({
        userId: appeal.requesterId,
        type: 'system',
        title: '匯入申訴已處理',
        body: createDraft
          ? `管理員已為你建立問卷草稿，請到「我的問卷」查看並補上題目。${dto.adminNote ? `\n說明：${dto.adminNote}` : ''}`
          : `你的匯入申訴已處理。${dto.adminNote ? `\n說明：${dto.adminNote}` : ''}`,
        metadata: { importAppealId: appealId, resolvedSurveyId },
      })
      .catch((err) => this.logger.error('通知申請者失敗', err));

    return { message: '已處理', resolvedSurveyId };
  }

  /** 管理員駁回 */
  async dismiss(appealId: string, adminId: string, adminNote: string) {
    if (!adminNote || adminNote.trim().length < 3) {
      throw new BadRequestException('駁回必須填寫原因');
    }
    const rows = await this.db.select().from(importAppeals).where(eq(importAppeals.id, appealId)).limit(1);
    const appeal = rows[0];
    if (!appeal) throw new NotFoundException('申訴不存在');
    if (appeal.status !== 'pending') throw new BadRequestException('此申訴已處理');

    await this.db
      .update(importAppeals)
      .set({ status: 'dismissed', adminNote: adminNote.slice(0, 500), resolvedBy: adminId, resolvedAt: new Date() })
      .where(and(eq(importAppeals.id, appealId)));

    await this.notifications
      .create({
        userId: appeal.requesterId,
        type: 'system',
        title: '匯入申訴未通過',
        body: `原因：${adminNote.slice(0, 300)}`,
        metadata: { importAppealId: appealId },
      })
      .catch((err) => this.logger.error('通知申請者失敗', err));

    return { message: '已駁回' };
  }
}
