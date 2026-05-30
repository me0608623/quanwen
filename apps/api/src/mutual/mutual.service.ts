import {
  Injectable,
  Inject,
  Optional,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, or, lt, desc, isNotNull, sql } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import {
  mutualPairs,
  surveys,
  surveyQuestions,
  questionOptions,
  surveyResponses,
  responseAnswers,
  respondentProfiles,
  users,
} from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { QualityAuditService } from '../responses/quality-audit.service';
import { ReputationService } from '../responses/reputation.service';
import { SpinService } from '../spin/spin.service';
import { RedisLockService } from '../common/redis/redis-lock.service';

const MUTUAL_TTL_MS = 72 * 60 * 60 * 1000; // 72 小時超時

// P3: cron 分散式鎖 — key 與 TTL（TTL 略小於各自 cron 間隔，holder 崩潰時下個 tick 能重取）
const MATCH_LOCK_KEY = 'qw:lock:mutual-match';
const MATCH_LOCK_TTL_MS = 25_000; // 間隔 30s
const EXPIRE_LOCK_KEY = 'qw:lock:mutual-expire';
const EXPIRE_LOCK_TTL_MS = 50_000; // 間隔 60s

interface MutualSide {
  userId: string;
  displayName: string;
  reputationScore: number | null; // 對方的信譽分（null = 對方還沒建 respondent_profile）
  surveyId: string;
  surveyTitle: string;
  filledAt: Date | null;
  responseId: string | null;
}

export interface MutualPairView {
  id: string;
  status: 'waiting' | 'matched' | 'a_done' | 'b_done' | 'both_done' | 'expired' | 'cancelled';
  matchedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  iAm: 'a' | 'b';
  // 我這邊（self）拋出去的 mutual survey + 我有沒有收到對方填答
  self: MutualSide;
  // 對手那邊（other）
  other: MutualSide | null;
  // 接下來我該做什麼
  nextAction:
    | 'wait_match'        // 還在配對池
    | 'fill_other'        // 配對成功，輪到我填對方
    | 'wait_other_fill'   // 我已填，等對方填
    | 'unlocked'          // 雙方都過，可看對方填答
    | 'expired_or_dead';  // 超時/取消
}

@Injectable()
export class MutualService {
  private readonly logger = new Logger(MutualService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly notifications: NotificationsService,
    private readonly qualityAudit: QualityAuditService,
    private readonly reputation: ReputationService,
    // @Optional — service-level 測試以 4 args 手動 new 時為 undefined（正式 DI 會注入）。
    @Optional() private readonly spin?: SpinService,
    // P3: 多實例下用分散式鎖避免 cron 重複執行。
    // @Optional — service-level 測試以 4 args 手動 new 時為 undefined → cron 直接執行（現狀）。
    @Optional() private readonly lock?: RedisLockService,
  ) {}

  // ─── 我的互惠統計（給用戶看自己的歷史） ───────────────────────────────────

  async getMyStats(userId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    successRate: number; // % of terminal pairs that ended both_done
  }> {
    const rows = await this.db
      .select({ status: mutualPairs.status })
      .from(mutualPairs)
      .where(or(eq(mutualPairs.aUserId, userId), eq(mutualPairs.bUserId, userId)));

    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }

    const terminal = (byStatus.both_done ?? 0) + (byStatus.expired ?? 0) + (byStatus.cancelled ?? 0);
    const successRate = terminal > 0
      ? Math.round(((byStatus.both_done ?? 0) / terminal) * 100)
      : 0;

    return { total: rows.length, byStatus, successRate };
  }

  // ─── 配對池狀態（給用戶看「等等就有對手」） ──────────────────────────────

  async getPoolStats(userId: string): Promise<{ waiting: number; myWaiting: number }> {
    // 兩個 COUNT 查詢比拉全表再 .filter 省，配對池可能上百萬筆
    const [waitingRow] = await this.db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(mutualPairs)
      .where(eq(mutualPairs.status, 'waiting'));
    const [myWaitingRow] = await this.db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(mutualPairs)
      .where(and(eq(mutualPairs.status, 'waiting'), eq(mutualPairs.aUserId, userId)));

    return {
      waiting: Number(waitingRow?.n ?? 0),
      myWaiting: Number(myWaitingRow?.n ?? 0),
    };
  }

  // ─── 列出當前 user 的所有 mutual pairs ───────────────────────────────────────

  async listMyPairs(userId: string): Promise<MutualPairView[]> {
    // 先撈出所有 user 是 A 或 B 的 pair
    const rows = await this.db
      .select()
      .from(mutualPairs)
      .where(or(eq(mutualPairs.aUserId, userId), eq(mutualPairs.bUserId, userId)))
      .orderBy(desc(mutualPairs.createdAt));

    if (rows.length === 0) return [];

    // 把所有相關的 userId / surveyId 抓出來補資料
    const userIds = new Set<string>();
    const surveyIds = new Set<string>();
    for (const r of rows) {
      userIds.add(r.aUserId);
      surveyIds.add(r.aSurveyId);
      if (r.bUserId) userIds.add(r.bUserId);
      if (r.bSurveyId) surveyIds.add(r.bSurveyId);
    }

    const userRows = userIds.size
      ? await this.db.select({ id: users.id, displayName: users.displayName }).from(users).where(or(...[...userIds].map((id) => eq(users.id, id))))
      : [];
    const surveyRows = surveyIds.size
      ? await this.db.select({ id: surveys.id, title: surveys.title }).from(surveys).where(or(...[...surveyIds].map((id) => eq(surveys.id, id))))
      : [];
    const repRows = userIds.size
      ? await this.db
          .select({ userId: respondentProfiles.userId, reputationScore: respondentProfiles.reputationScore })
          .from(respondentProfiles)
          .where(or(...[...userIds].map((id) => eq(respondentProfiles.userId, id))))
      : [];

    const nameOf = new Map(userRows.map((u) => [u.id, u.displayName]));
    const titleOf = new Map(surveyRows.map((s) => [s.id, s.title]));
    const repOf = new Map(repRows.map((r) => [r.userId, r.reputationScore]));

    return rows.map((r) => this.buildView(r, userId, nameOf, titleOf, repOf));
  }

  private buildView(
    r: typeof mutualPairs.$inferSelect,
    me: string,
    nameOf: Map<string, string>,
    titleOf: Map<string, string>,
    repOf: Map<string, number>,
  ): MutualPairView {
    const iAm: 'a' | 'b' = r.aUserId === me ? 'a' : 'b';

    const selfSide: MutualSide =
      iAm === 'a'
        ? {
            userId: r.aUserId,
            displayName: nameOf.get(r.aUserId) ?? '(unknown)',
            reputationScore: repOf.get(r.aUserId) ?? null,
            surveyId: r.aSurveyId,
            surveyTitle: titleOf.get(r.aSurveyId) ?? '(unknown)',
            filledAt: r.bFilledAt, // 對方對我這份 survey 的填答時間
            responseId: r.bResponseId,
          }
        : {
            userId: r.bUserId!,
            displayName: nameOf.get(r.bUserId!) ?? '(unknown)',
            reputationScore: repOf.get(r.bUserId!) ?? null,
            surveyId: r.bSurveyId!,
            surveyTitle: titleOf.get(r.bSurveyId!) ?? '(unknown)',
            filledAt: r.aFilledAt,
            responseId: r.aResponseId,
          };

    const otherSide: MutualSide | null =
      iAm === 'a' && r.bUserId && r.bSurveyId
        ? {
            userId: r.bUserId,
            displayName: nameOf.get(r.bUserId) ?? '(unknown)',
            reputationScore: repOf.get(r.bUserId) ?? null,
            surveyId: r.bSurveyId,
            surveyTitle: titleOf.get(r.bSurveyId) ?? '(unknown)',
            filledAt: r.aFilledAt, // 我有沒有填對方
            responseId: r.aResponseId,
          }
        : iAm === 'b'
          ? {
              userId: r.aUserId,
              displayName: nameOf.get(r.aUserId) ?? '(unknown)',
              reputationScore: repOf.get(r.aUserId) ?? null,
              surveyId: r.aSurveyId,
              surveyTitle: titleOf.get(r.aSurveyId) ?? '(unknown)',
              filledAt: r.bFilledAt,
              responseId: r.bResponseId,
            }
          : null;

    let nextAction: MutualPairView['nextAction'] = 'wait_match';
    if (r.status === 'waiting') nextAction = 'wait_match';
    else if (r.status === 'both_done') nextAction = 'unlocked';
    else if (r.status === 'expired' || r.status === 'cancelled') nextAction = 'expired_or_dead';
    else {
      // matched / a_done / b_done
      const myFilledForOther = iAm === 'a' ? r.aFilledAt : r.bFilledAt;
      if (myFilledForOther) nextAction = 'wait_other_fill';
      else nextAction = 'fill_other';
    }

    return {
      id: r.id,
      status: r.status,
      matchedAt: r.matchedAt,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      iAm,
      self: selfSide,
      other: otherSide,
      nextAction,
    };
  }

  // ─── 取得某個 pair + 該填的問卷詳情 ──────────────────────────────────────────

  async getPairWithSurvey(pairId: string, userId: string) {
    const rows = await this.db.select().from(mutualPairs).where(eq(mutualPairs.id, pairId)).limit(1);
    const pair = rows[0];
    if (!pair) throw new NotFoundException('配對不存在');

    const isA = pair.aUserId === userId;
    const isB = pair.bUserId === userId;
    if (!isA && !isB) throw new ForbiddenException('無權存取此配對');

    // 我要填的是「對方那份 survey」
    const targetSurveyId = isA ? pair.bSurveyId : pair.aSurveyId;
    const survey = targetSurveyId
      ? await this.loadSurveyWithQuestions(targetSurveyId)
      : null;

    // 解鎖後可以看「對方在我這份 survey 的填答」
    // A 看 B 的填答 = bResponseId on A's survey
    // B 看 A 的填答 = aResponseId on B's survey
    let unlocked: {
      mySurveyTitle: string;
      otherDisplayName: string;
      questions: Array<{
        id: string;
        title: string;
        type: string;
        sortOrder: number;
        config: Record<string, unknown> | null;
        options: Array<{ id: string; label: string; sortOrder: number }>;
        answer: {
          textAnswer: string | null;
          selectedOptionIds: string[] | null;
          ratingValue: number | null;
        } | null;
      }>;
    } | null = null;

    if (pair.status === 'both_done') {
      const mySurveyId = isA ? pair.aSurveyId : pair.bSurveyId!;
      const otherResponseId = isA ? pair.bResponseId : pair.aResponseId;
      const otherUserId = isA ? pair.bUserId! : pair.aUserId;

      const mySurvey = await this.loadSurveyWithQuestions(mySurveyId);
      const otherUserRow = await this.db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      let answerRows: Array<{
        questionId: string;
        textAnswer: string | null;
        selectedOptionIds: unknown;
        ratingValue: number | null;
      }> = [];
      if (otherResponseId) {
        answerRows = await this.db
          .select({
            questionId: responseAnswers.questionId,
            textAnswer: responseAnswers.textAnswer,
            selectedOptionIds: responseAnswers.selectedOptionIds,
            ratingValue: responseAnswers.ratingValue,
          })
          .from(responseAnswers)
          .where(eq(responseAnswers.responseId, otherResponseId));
      }
      const answerByQ = new Map(
        answerRows.map((a) => [
          a.questionId,
          {
            textAnswer: a.textAnswer,
            selectedOptionIds: Array.isArray(a.selectedOptionIds)
              ? (a.selectedOptionIds as string[])
              : null,
            ratingValue: a.ratingValue,
          },
        ]),
      );

      if (mySurvey) {
        unlocked = {
          mySurveyTitle: mySurvey.title,
          otherDisplayName: otherUserRow[0]?.displayName ?? '對方',
          questions: mySurvey.questions.map((q) => ({
            id: q.id,
            title: q.title,
            type: q.type,
            sortOrder: q.sortOrder,
            config: (q.config as Record<string, unknown> | null) ?? null,
            options: q.options.map((o) => ({ id: o.id, label: o.label, sortOrder: o.sortOrder })),
            answer: answerByQ.get(q.id) ?? null,
          })),
        };
      }
    }

    return { pair, survey, unlocked };
  }

  private async loadSurveyWithQuestions(surveyId: string) {
    const surveyRows = await this.db
      .select()
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);
    const survey = surveyRows[0];
    if (!survey) return null;

    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyId))
      .orderBy(surveyQuestions.sortOrder);

    const qIds = questions.map((q) => q.id);
    const options = qIds.length
      ? await this.db
          .select()
          .from(questionOptions)
          .where(or(...qIds.map((id) => eq(questionOptions.questionId, id))))
          .orderBy(questionOptions.sortOrder)
      : [];

    return {
      ...survey,
      questions: questions.map((q) => ({
        ...q,
        options: options.filter((o) => o.questionId === q.id),
      })),
    };
  }

  // ─── 停權檢查（共享 standard 的邏輯）──────────────────────────────────────

  private async assertNotSuspended(userId: string): Promise<void> {
    const rows = await this.db
      .select({
        suspendedUntil: respondentProfiles.suspendedUntil,
        suspendedReason: respondentProfiles.suspendedReason,
      })
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, userId))
      .limit(1);

    const profile = rows[0];
    if (!profile?.suspendedUntil) return;

    const now = new Date();
    if (profile.suspendedUntil > now) {
      const days = Math.ceil(
        (profile.suspendedUntil.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      throw new ForbiddenException(
        `${profile.suspendedReason ?? '帳號暫停接案'}（剩 ${days} 天）`,
      );
    }
  }

  // ─── 把現有 mutual 問卷重新放回 waiting 池 ────────────────────────────────

  async reEnqueueSurvey(userId: string, surveyId: string): Promise<{ pairId: string }> {
    // 先確認 survey 是用戶自己的, 且是 mutual + published
    const surveyRows = await this.db
      .select({ id: surveys.id, surveyorId: surveys.surveyorId, type: surveys.type, status: surveys.status })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);
    const survey = surveyRows[0];
    if (!survey) throw new NotFoundException('問卷不存在');
    if (survey.surveyorId !== userId) throw new ForbiddenException('無權操作此問卷');
    if (survey.type !== 'mutual') throw new BadRequestException('僅互惠問卷可進配對池');
    if (survey.status !== 'published') throw new BadRequestException('問卷需上架後才能進配對池');

    // 確認此 survey 不在 active 配對中 (waiting/matched/a_done/b_done)
    const active = await this.db
      .select({ id: mutualPairs.id, status: mutualPairs.status })
      .from(mutualPairs)
      .where(
        and(
          eq(mutualPairs.aSurveyId, surveyId),
          or(
            eq(mutualPairs.status, 'waiting'),
            eq(mutualPairs.status, 'matched'),
            eq(mutualPairs.status, 'a_done'),
            eq(mutualPairs.status, 'b_done'),
          ),
        ),
      )
      .limit(1);

    if (active.length > 0) {
      throw new BadRequestException('此問卷已在配對池中或正在配對');
    }

    const inserted = await this.db
      .insert(mutualPairs)
      .values({ aUserId: userId, aSurveyId: surveyId, status: 'waiting' })
      .returning({ id: mutualPairs.id });

    return { pairId: inserted[0].id };
  }

  // ─── 提交對方問卷的填答（mutual 專用、minimal path）─────────────────────────

  async submitMutualResponse(
    pairId: string,
    userId: string,
    answers: Array<{ questionId: string; textAnswer?: string; selectedOptionIds?: string[]; ratingValue?: number }>,
  ) {
    const rows = await this.db.select().from(mutualPairs).where(eq(mutualPairs.id, pairId)).limit(1);
    const pair = rows[0];
    if (!pair) throw new NotFoundException('配對不存在');

    const isA = pair.aUserId === userId;
    const isB = pair.bUserId === userId;
    if (!isA && !isB) throw new ForbiddenException('無權更新此配對');
    if (pair.status === 'expired' || pair.status === 'cancelled' || pair.status === 'both_done') {
      throw new BadRequestException('此配對已結束');
    }
    if (pair.status === 'waiting' || !pair.bUserId) {
      throw new BadRequestException('尚未配對到對手');
    }

    // Phase 5.5：跟 standard responses 一致, 停權者不可填
    await this.assertNotSuspended(userId);

    // 我要填的是「對方那份 survey」
    const targetSurveyId = isA ? pair.bSurveyId : pair.aSurveyId;
    if (!targetSurveyId) throw new BadRequestException('配對缺少目標問卷');

    // 我先前是否已提交過？
    const myFilledBefore = isA ? pair.aFilledAt : pair.bFilledAt;
    if (myFilledBefore) {
      throw new BadRequestException('你已提交過此配對的填答');
    }

    const now = new Date();
    // response + answers must be atomic: if answer insert fails, response is orphaned
    let responseId = '' as string; // assigned inside db.transaction below
    try {
    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(surveyResponses)
        .values({
          surveyId: targetSurveyId,
          respondentId: userId,
          status: 'submitted',
          submittedAt: now,
        })
        .returning({ id: surveyResponses.id });

      responseId = inserted[0].id;

      if (answers.length > 0) {
        await tx.insert(responseAnswers).values(
          answers.map((a) => ({
            responseId: responseId!,
            surveyId: targetSurveyId, // 反正規化（§3-B1）
            questionId: a.questionId,
            textAnswer: a.textAnswer ?? null,
            selectedOptionIds: a.selectedOptionIds ?? null,
            ratingValue: a.ratingValue ?? null,
          })),
        );
      }
    });
    } catch (err: unknown) {
      // Concurrent submit race: unique constraint on (surveyId, respondentId) hit
      if ((err as { code?: string })?.code === '23505') {
        throw new BadRequestException('你已提交過此配對的填答');
      }
      throw err;
    }

    // ── AI 品質審核（不能讓對方拿到灌水的填答）──
    try {
      const breakdown = await this.qualityAudit.audit(responseId, { fillDurationSeconds: null });
      await this.db
        .update(surveyResponses)
        .set({
          qualityScore: breakdown.finalScore,
          qualityBreakdown: breakdown,
          status: breakdown.status === 'rejected' ? 'rejected' : 'submitted',
        })
        .where(eq(surveyResponses.id, responseId));

      if (breakdown.status === 'rejected') {
        // 互惠退件 -3 (比 standard 退件 -5 輕一點; mutual 風險較低)
        await this.reputation.adjust(userId, -3, '互惠填答未通過 AI 品質審核');
        await this.cancelPairForCheating(pair, userId, breakdown.finalScore);
        throw new BadRequestException(
          `填答品質未達標（分數 ${breakdown.finalScore}），此配對已取消。請重新發佈互惠問卷。`,
        );
      }

      // 順利通過 → +1 reputation
      if (breakdown.status === 'passed') {
        await this.reputation.adjust(userId, 1, '互惠填答通過 AI 品質審核');
      }
    } catch (err) {
      // BadRequest（rejected case）直接 rethrow；其他錯誤吞掉 fallback to markFilled
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Quality audit failed for mutual response ${responseId} — fallback to markFilled`, err);
    }

    await this.markFilled(pairId, userId, responseId);

    // 完成一份互惠填答 → +1 轉盤抽獎次數（fire-and-forget；rejected 已在上方 throw）
    this.spin
      ?.grantChance(userId, 1, '完成互惠填答')
      .catch((err: unknown) => this.logger.error(`轉盤次數發放失敗 user=${userId}`, err));

    return { responseId, pairId };
  }

  // ─── 因 AI 退件取消配對 ──────────────────────────────────────────────────────

  private async cancelPairForCheating(
    pair: typeof mutualPairs.$inferSelect,
    cheaterId: string,
    score: number,
  ) {
    const now = new Date();
    await this.db
      .update(mutualPairs)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(mutualPairs.id, pair.id));

    this.logger.warn(`Mutual pair cancelled by AI audit: pair=${pair.id} cheater=${cheaterId.slice(0, 8)} score=${score}`);

    await this.notifications.create({
      userId: cheaterId,
      type: 'system',
      title: '互惠配對已取消（AI 退件）',
      body: `你的填答未通過品質審核（分數 ${score}），此配對已取消。請重新發佈互惠問卷。`,
      metadata: { pairId: pair.id, score },
    });

    const otherId = pair.aUserId === cheaterId ? pair.bUserId : pair.aUserId;
    if (otherId) {
      await this.notifications.create({
        userId: otherId,
        type: 'system',
        title: '互惠配對已取消',
        body: '對方填答未通過品質審核，此配對已取消。系統會幫你自動重新進入配對池。',
        metadata: { pairId: pair.id },
      });

      // 自動把對方那份問卷重新放回池子等下一輪配對
      const otherSurveyId = pair.aUserId === cheaterId ? pair.bSurveyId : pair.aSurveyId;
      if (otherSurveyId) {
        try {
          await this.db
            .insert(mutualPairs)
            .values({ aUserId: otherId, aSurveyId: otherSurveyId, status: 'waiting' })
            .onConflictDoNothing();
        } catch (err) {
          this.logger.warn(`Re-enqueue mutual survey ${otherSurveyId} failed`, err);
        }
      }
    }
  }

  // ─── Phase C-3: 外部連結互惠 — 上傳截圖證明 ─────────────────────────────────

  async submitProof(pairId: string, userId: string, proofUrl: string) {
    const rows = await this.db.select().from(mutualPairs).where(eq(mutualPairs.id, pairId)).limit(1);
    const pair = rows[0];
    if (!pair) throw new NotFoundException('配對不存在');
    const isA = pair.aUserId === userId;
    const isB = pair.bUserId === userId;
    if (!isA && !isB) throw new ForbiddenException('無權更新此配對');
    if (pair.status === 'expired' || pair.status === 'cancelled' || pair.status === 'both_done') {
      throw new BadRequestException('此配對已結束');
    }
    if (pair.status === 'waiting' || !pair.bUserId) {
      throw new BadRequestException('尚未配對到對手');
    }

    const now = new Date();
    const updates: Partial<typeof mutualPairs.$inferInsert> = { updatedAt: now };
    if (isA) {
      updates.aProofUrl = proofUrl;
      updates.aFilledAt = now;
    } else {
      updates.bProofUrl = proofUrl;
      updates.bFilledAt = now;
    }

    const otherFilled = isA ? !!pair.bProofUrl : !!pair.aProofUrl;
    updates.status = otherFilled ? 'both_done' : (isA ? 'a_done' : 'b_done');

    await this.db.update(mutualPairs).set(updates).where(eq(mutualPairs.id, pairId));

    // 通知
    const otherId = isA ? pair.bUserId : pair.aUserId;
    if (updates.status === 'both_done') {
      for (const uid of [pair.aUserId, pair.bUserId].filter(Boolean) as string[]) {
        await this.notifications.create({
          userId: uid,
          type: 'system',
          title: '互惠雙方都已上傳截圖',
          body: '雙方都完成外部問卷並上傳截圖，現在可以互相評分了。',
          metadata: { pairId },
        });
      }
    } else if (otherId) {
      await this.notifications.create({
        userId: otherId,
        type: 'system',
        title: '對方已上傳完成截圖',
        body: '輪到你完成外部問卷並上傳截圖，雙方完成後即可互評。',
        metadata: { pairId },
      });
    }

    return { pairId, status: updates.status };
  }

  // ─── Phase C-3: 互評信譽 ────────────────────────────────────────────────────

  async rateOther(pairId: string, userId: string, rating: number) {
    if (rating < 1 || rating > 5) throw new BadRequestException('評分需在 1-5 之間');

    const rows = await this.db.select().from(mutualPairs).where(eq(mutualPairs.id, pairId)).limit(1);
    const pair = rows[0];
    if (!pair) throw new NotFoundException('配對不存在');
    const isA = pair.aUserId === userId;
    const isB = pair.bUserId === userId;
    if (!isA && !isB) throw new ForbiddenException('無權評分此配對');
    // 必須雙方都已上傳截圖 (both_done) 才開放互評
    if (pair.status !== 'both_done') {
      throw new BadRequestException('雙方都完成並上傳截圖後才能互評');
    }

    const alreadyRated = isA ? pair.aRating : pair.bRating;
    if (alreadyRated != null) throw new BadRequestException('你已經評過分了');

    const otherId = isA ? pair.bUserId! : pair.aUserId;
    const now = new Date();
    await this.db
      .update(mutualPairs)
      .set(isA ? { aRating: rating, aRatedAt: now, updatedAt: now } : { bRating: rating, bRatedAt: now, updatedAt: now })
      .where(eq(mutualPairs.id, pairId));

    // 評分 → 對方 reputation
    // 4-5 → +2, 3 → 0, 1-2 → -3
    const delta = rating >= 4 ? 2 : rating <= 2 ? -3 : 0;
    if (delta !== 0) {
      await this.reputation.adjust(otherId, delta, `互惠互評 ${rating} 星`);
    }

    await this.notifications.create({
      userId: otherId,
      type: 'system',
      title: `你收到一則互惠評分：${rating} 星`,
      body: rating >= 4 ? '對方給了你好評，信譽分上升！' : rating <= 2 ? '對方給了你低評，信譽分下降，請認真完成互惠問卷。' : '對方給了你普通評分。',
      metadata: { pairId, rating },
    });

    return { pairId, rating, otherReputationDelta: delta };
  }

  // ─── 紀錄填答（連結到 mutual pair 上）─────────────────────────────────────

  async markFilled(pairId: string, userId: string, responseId: string) {
    const rows = await this.db.select().from(mutualPairs).where(eq(mutualPairs.id, pairId)).limit(1);
    const pair = rows[0];
    if (!pair) throw new NotFoundException('配對不存在');

    const isA = pair.aUserId === userId;
    const isB = pair.bUserId === userId;
    if (!isA && !isB) throw new ForbiddenException('無權更新此配對');
    if (pair.status === 'expired' || pair.status === 'cancelled' || pair.status === 'both_done') {
      throw new BadRequestException('此配對已結束');
    }
    if (pair.status === 'waiting') {
      throw new BadRequestException('尚未配對到對手');
    }

    const now = new Date();
    const updates: Partial<typeof mutualPairs.$inferInsert> = { updatedAt: now };

    if (isA) {
      updates.aResponseId = responseId;
      updates.aFilledAt = now;
    } else {
      updates.bResponseId = responseId;
      updates.bFilledAt = now;
    }

    // 計算新 status
    const otherFilled = isA ? !!pair.bFilledAt : !!pair.aFilledAt;
    if (otherFilled) {
      updates.status = 'both_done';
    } else {
      updates.status = isA ? 'a_done' : 'b_done';
    }

    await this.db.update(mutualPairs).set(updates).where(eq(mutualPairs.id, pairId));

    // 通知對方
    if (updates.status === 'both_done') {
      // 雙方都過，兩邊都通知解鎖
      await this.notifications.create({
        userId: pair.aUserId,
        type: 'system',
        title: '互惠問卷已解鎖',
        body: '你和配對對手都已完成填答，可查看對方的填答結果。',
        metadata: { pairId },
      });
      if (pair.bUserId) {
        await this.notifications.create({
          userId: pair.bUserId,
          type: 'system',
          title: '互惠問卷已解鎖',
          body: '你和配對對手都已完成填答，可查看對方的填答結果。',
          metadata: { pairId },
        });
      }
    } else {
      const otherUserId = isA ? pair.bUserId : pair.aUserId;
      if (otherUserId) {
        await this.notifications.create({
          userId: otherUserId,
          type: 'system',
          title: '對方已完成互惠填答',
          body: '輪到你填答對方的問卷了，72 小時內完成即可解鎖。',
          metadata: { pairId },
        });
      }
    }
  }

  // ─── 配對 cron：每 30 秒掃一次 waiting pool ────────────────────────────────
  // 策略：對每個 waiting pair, 先找同 category 的對手, 沒有再退 FIFO 任意不同 user

  @Cron(CronExpression.EVERY_30_SECONDS)
  async matchWaitingPairs() {
    // P3: 多實例下只讓一台執行；無 lock（測試 / 單實例）→ 直接跑。
    if (this.lock) {
      await this.lock.withLock(MATCH_LOCK_KEY, MATCH_LOCK_TTL_MS, () => this.doMatchWaitingPairs());
    } else {
      await this.doMatchWaitingPairs();
    }
  }

  /** 實際配對邏輯（與原 matchWaitingPairs 內容相同；測試直呼上方 wrapper 時走這裡） */
  async doMatchWaitingPairs() {
    const waiting = await this.db
      .select({
        id: mutualPairs.id,
        aUserId: mutualPairs.aUserId,
        aSurveyId: mutualPairs.aSurveyId,
        createdAt: mutualPairs.createdAt,
        category: surveys.category,
      })
      .from(mutualPairs)
      .innerJoin(surveys, eq(surveys.id, mutualPairs.aSurveyId))
      .where(eq(mutualPairs.status, 'waiting'))
      .orderBy(mutualPairs.createdAt);

    if (waiting.length < 2) return;

    const used = new Set<string>();

    for (let i = 0; i < waiting.length; i++) {
      const a = waiting[i];
      if (used.has(a.id)) continue;

      // 1. 先找同 category, userId 不同的, 最早的
      let b = a.category
        ? waiting.find(
            (x) =>
              !used.has(x.id) &&
              x.id !== a.id &&
              x.aUserId !== a.aUserId &&
              x.category === a.category,
          )
        : undefined;

      // 2. fallback: FIFO 任意不同 user
      if (!b) {
        b = waiting.find(
          (x) => !used.has(x.id) && x.id !== a.id && x.aUserId !== a.aUserId,
        );
      }
      if (!b) continue;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + MUTUAL_TTL_MS);

      // 把 b 的資料併入 a，並刪掉 b（簡化：保留 a 為配對主體）
      try {
        await this.db
          .update(mutualPairs)
          .set({
            status: 'matched',
            bUserId: b.aUserId,
            bSurveyId: b.aSurveyId,
            matchedAt: now,
            expiresAt,
            updatedAt: now,
          })
          .where(eq(mutualPairs.id, a.id));

        await this.db.delete(mutualPairs).where(eq(mutualPairs.id, b.id));

        used.add(a.id);
        used.add(b.id);

        this.logger.log(`Matched mutual pair: A=${a.aUserId.slice(0, 8)} B=${b.aUserId.slice(0, 8)}`);

        // 通知雙方
        await this.notifications.create({
          userId: a.aUserId,
          type: 'system',
          title: '互惠配對成功',
          body: '你的互惠問卷已配對到對手，請去填寫對方的問卷。',
          metadata: { pairId: a.id },
        });
        await this.notifications.create({
          userId: b.aUserId,
          type: 'system',
          title: '互惠配對成功',
          body: '你的互惠問卷已配對到對手，請去填寫對方的問卷。',
          metadata: { pairId: a.id },
        });
      } catch (err) {
        this.logger.error(`配對失敗 pair=${a.id}/${b.id}`, err);
      }
    }
  }

  // ─── 超時 cron：每分鐘清掉 expired pair ────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async expireOverduePairs() {
    // P3: 多實例下只讓一台執行；無 lock（測試 / 單實例）→ 直接跑。
    if (this.lock) {
      await this.lock.withLock(EXPIRE_LOCK_KEY, EXPIRE_LOCK_TTL_MS, () => this.doExpireOverduePairs());
    } else {
      await this.doExpireOverduePairs();
    }
  }

  /** 實際超時清理邏輯（與原 expireOverduePairs 內容相同） */
  async doExpireOverduePairs() {
    const now = new Date();
    const expired = await this.db
      .select({ id: mutualPairs.id, aUserId: mutualPairs.aUserId, bUserId: mutualPairs.bUserId })
      .from(mutualPairs)
      .where(
        and(
          isNotNull(mutualPairs.expiresAt),
          lt(mutualPairs.expiresAt, now),
          // 還沒解鎖的才會被超時
          or(
            eq(mutualPairs.status, 'matched'),
            eq(mutualPairs.status, 'a_done'),
            eq(mutualPairs.status, 'b_done'),
          ),
        ),
      );

    for (const p of expired) {
      await this.db
        .update(mutualPairs)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(mutualPairs.id, p.id));

      this.logger.warn(`Mutual pair expired: ${p.id}`);
      await this.notifications.create({
        userId: p.aUserId,
        type: 'system',
        title: '互惠配對超時',
        body: '72 小時內未完成填答，此配對已標記為超時。',
        metadata: { pairId: p.id },
      });
      if (p.bUserId) {
        await this.notifications.create({
          userId: p.bUserId,
          type: 'system',
          title: '互惠配對超時',
          body: '72 小時內未完成填答，此配對已標記為超時。',
          metadata: { pairId: p.id },
        });
      }
    }
  }
}
