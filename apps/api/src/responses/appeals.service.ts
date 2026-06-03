import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { and, eq, desc, inArray, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  responseAppeals,
  surveyResponses,
  surveys,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { QualityAuditService } from './quality-audit.service';
import { ReputationService } from './reputation.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
    private readonly qualityAudit: QualityAuditService,
    private readonly reputation: ReputationService,
    private readonly wallet: WalletService,
  ) {}

  /** 受試者：對 rejected response 提出申訴 */
  async createAppeal(responseId: string, respondentId: string, reason: string) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('申訴原因至少需 5 字');
    }

    // 確認 response 存在、屬於該受試者、狀態為 rejected
    const respRows = await this.db
      .select({
        id: surveyResponses.id,
        respondentId: surveyResponses.respondentId,
        status: surveyResponses.status,
      })
      .from(surveyResponses)
      .where(eq(surveyResponses.id, responseId))
      .limit(1);
    const resp = respRows[0];
    if (!resp) throw new NotFoundException('填答紀錄不存在');
    if (resp.respondentId !== respondentId) {
      throw new ForbiddenException('無權對此填答申訴');
    }
    if (resp.status !== 'rejected') {
      throw new BadRequestException('僅退件的填答可申訴');
    }

    // 一筆只能申訴一次
    const exist = await this.db
      .select({ id: responseAppeals.id })
      .from(responseAppeals)
      .where(eq(responseAppeals.responseId, responseId))
      .limit(1);
    if (exist.length > 0) {
      throw new ConflictException('此填答已提交過申訴');
    }

    let inserted: typeof responseAppeals.$inferSelect[];
    try {
      inserted = await this.db
        .insert(responseAppeals)
        .values({
          responseId,
          respondentId,
          reason: reason.trim().slice(0, 2000),
        })
        .returning();
    } catch (err: unknown) {
      // Concurrent appeal race: unique constraint on responseId hit
      if ((err as { code?: string })?.code === '23505') {
        throw new ConflictException('此填答已提交過申訴');
      }
      throw err;
    }

    this.logger.log(`受試者 ${respondentId} 申訴 response=${responseId}`);
    return { message: '申訴已提交，請等待管理員處理', appeal: inserted[0] };
  }

  /** 受試者：查看自己的申訴狀態列表 */
  async getMyAppeals(respondentId: string) {
    return this.db
      .select({
        id: responseAppeals.id,
        responseId: responseAppeals.responseId,
        reason: responseAppeals.reason,
        status: responseAppeals.status,
        adminNote: responseAppeals.adminNote,
        createdAt: responseAppeals.createdAt,
        resolvedAt: responseAppeals.resolvedAt,
      })
      .from(responseAppeals)
      .where(eq(responseAppeals.respondentId, respondentId))
      .orderBy(desc(responseAppeals.createdAt));
  }

  /** Admin：列出申訴 */
  async listAppeals(status?: 'pending' | 'approved' | 'dismissed') {
    const condition = status ? eq(responseAppeals.status, status) : undefined;
    return this.db
      .select({
        id: responseAppeals.id,
        responseId: responseAppeals.responseId,
        respondentId: responseAppeals.respondentId,
        reason: responseAppeals.reason,
        status: responseAppeals.status,
        adminNote: responseAppeals.adminNote,
        createdAt: responseAppeals.createdAt,
        resolvedAt: responseAppeals.resolvedAt,
        // 帶入 response context 方便 admin 判斷
        surveyId: surveyResponses.surveyId,
        qualityScore: surveyResponses.qualityScore,
        surveyTitle: surveys.title,
        rewardPoints: surveys.rewardPoints,
        rewardMode: surveys.rewardMode,
        lotteryPrize: surveys.lotteryPrize,
      })
      .from(responseAppeals)
      .innerJoin(surveyResponses, eq(responseAppeals.responseId, surveyResponses.id))
      .innerJoin(surveys, eq(surveyResponses.surveyId, surveys.id))
      .where(condition)
      .orderBy(desc(responseAppeals.createdAt))
      .limit(200);
  }

  /** Admin：通過申訴 — 補回配額、恢復有效填答、補發固定獎勵、reputation +5 */
  async approveAppeal(appealId: string, adminId: string, adminNote?: string) {
    const appeal = await this.loadAppealForResolve(appealId);

    // 1) 改判 response 狀態為 rewarded（直接給獎勵）
    const respRows = await this.db
      .select({
        id: surveyResponses.id,
        surveyId: surveyResponses.surveyId,
        respondentId: surveyResponses.respondentId,
        status: surveyResponses.status,
      })
      .from(surveyResponses)
      .where(eq(surveyResponses.id, appeal.responseId))
      .limit(1);
    const resp = respRows[0];
    if (!resp) throw new NotFoundException('填答紀錄不存在');

    if (resp.status !== 'rejected') {
      throw new ConflictException('填答已不是退件狀態，無法重複恢復資格');
    }

    const surveyRows = await this.db
      .select({
        id: surveys.id,
        rewardPoints: surveys.rewardPoints,
        rewardMode: surveys.rewardMode,
        lotteryDrawnAt: surveys.lotteryDrawnAt,
        surveyorId: surveys.surveyorId,
        title: surveys.title,
      })
      .from(surveys)
      .where(eq(surveys.id, resp.surveyId))
      .limit(1);
    const survey = surveyRows[0];
    if (!survey) throw new NotFoundException('問卷不存在');
    if (survey.rewardMode === 'lottery' && survey.lotteryDrawnAt) {
      throw new ConflictException('抽獎已完成，無法再補入參與名單');
    }

    const now = new Date();
    await this.db.transaction(async (tx) => {
      const quota = await tx
        .update(surveys)
        .set({ completedCount: sql`${surveys.completedCount} + 1` })
        .where(and(
          eq(surveys.id, survey.id),
          survey.rewardMode === 'lottery'
            ? inArray(surveys.status, ['published', 'closed'])
            : eq(surveys.status, 'published'),
          sql`${surveys.completedCount} < ${surveys.targetCount}`,
        ))
        .returning({ completedCount: surveys.completedCount, targetCount: surveys.targetCount });
      if (quota.length === 0) {
        throw new ConflictException('問卷已達配額或不再開放，無法恢復此填答資格');
      }
      if (quota[0].completedCount >= quota[0].targetCount) {
        await tx
          .update(surveys)
          .set({ status: 'closed' })
          .where(eq(surveys.id, survey.id));
      }

      await tx
        .update(surveyResponses)
        .set({ status: 'rewarded' })
        .where(eq(surveyResponses.id, resp.id));

      const resolved = await tx
        .update(responseAppeals)
        .set({
          status: 'approved',
          adminNote: adminNote?.slice(0, 500) ?? null,
          resolvedBy: adminId,
          resolvedAt: now,
        })
        .where(and(eq(responseAppeals.id, appealId), eq(responseAppeals.status, 'pending')))
        .returning({ id: responseAppeals.id });
      if (resolved.length === 0) throw new ConflictException('此申訴已被其他管理員處理');
    });

    // 2) 補發獎勵（透過 wallet service）
    if (survey.rewardMode === 'fixed' && survey.rewardPoints > 0) {
      try {
        await this.wallet.issueReward({
          surveyId: survey.id,
          responseId: resp.id,
          respondentId: resp.respondentId,
          surveyorId: survey.surveyorId,
          rewardAmount: survey.rewardPoints,
        });
      } catch (err) {
        this.logger.error(`申訴通過補發獎勵失敗 responseId=${resp.id}`, err);
      }
    }

    // 3) reputation +5（補償被誤判，走 ReputationService 寫歷史）
    await this.reputation.adjust(resp.respondentId, 5, '申訴通過補償');

    // 5) 通知受試者
    const resultMessage = survey.rewardMode === 'lottery'
      ? '您的申訴已通過，抽獎資格已恢復，信譽分 +5。'
      : `您的申訴已通過，獎勵 NT$${survey.rewardPoints} 已補發，信譽分 +5。`;
    await this.notifications.create({
      userId: resp.respondentId,
      type: 'system',
      title: `申訴成功：「${survey.title}」`,
      body: `${resultMessage}${adminNote ? `\n管理員說明：${adminNote}` : ''}`,
      metadata: { appealId, responseId: resp.id },
    });

    return {
      message: survey.rewardMode === 'lottery'
        ? '申訴已通過，抽獎資格與信譽分已恢復'
        : '申訴已通過，獎勵與信譽分已補發',
      appealId,
    };
  }

  /** Admin：駁回申訴 */
  async dismissAppeal(appealId: string, adminId: string, adminNote: string) {
    if (!adminNote || adminNote.trim().length < 5) {
      throw new BadRequestException('駁回需附說明（至少 5 字）');
    }

    const appeal = await this.loadAppealForResolve(appealId);

    const now = new Date();
    await this.db
      .update(responseAppeals)
      .set({
        status: 'dismissed',
        adminNote: adminNote.trim().slice(0, 500),
        resolvedBy: adminId,
        resolvedAt: now,
      })
      .where(eq(responseAppeals.id, appealId));

    // 取得 respondent + survey title 用於通知
    const respRows = await this.db
      .select({ respondentId: surveyResponses.respondentId, surveyId: surveyResponses.surveyId })
      .from(surveyResponses)
      .where(eq(surveyResponses.id, appeal.responseId))
      .limit(1);
    const surveyTitleRows = respRows[0]
      ? await this.db
          .select({ title: surveys.title })
          .from(surveys)
          .where(eq(surveys.id, respRows[0].surveyId))
          .limit(1)
      : [];

    if (respRows[0]) {
      await this.notifications.create({
        userId: respRows[0].respondentId,
        type: 'system',
        title: `申訴駁回：「${surveyTitleRows[0]?.title ?? '填答紀錄'}」`,
        body: `管理員審核結果：${adminNote.trim()}`,
        metadata: { appealId },
      });
    }

    return { message: '申訴已駁回', appealId };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async loadAppealForResolve(appealId: string) {
    const rows = await this.db
      .select()
      .from(responseAppeals)
      .where(eq(responseAppeals.id, appealId))
      .limit(1);
    const appeal = rows[0];
    if (!appeal) throw new NotFoundException('申訴不存在');
    if (appeal.status !== 'pending') {
      throw new BadRequestException('此申訴已被處理過');
    }
    return appeal;
  }

}
