import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq, sql, and, desc } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { surveys, surveyResponses, respondentProfiles, wallets } from '../db/schema';
import { ZaiClient } from '../ai-audit/zai.client';

export interface RespondentRecommendation {
  topPick: {
    surveyId: string;
    title: string;
    reward: number;
    reason: string;          // 為什麼適合你
  } | null;
  earnings: {
    completed: number;       // 已完成份數
    totalEarned: number;     // 累計收入
    weeklyPotential: number; // 若每天填 1 份的週收入潛力
  };
  tips: string[];            // 賺更多的小技巧
  generatedAt: string;
}

@Injectable()
export class RespondentAssistantService {
  private readonly logger = new Logger(RespondentAssistantService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly zai: ZaiClient,
  ) {}

  async recommend(respondentId: string): Promise<RespondentRecommendation> {
    // 取受試者 profile
    const profileRows = await this.db
      .select({
        ageRange: respondentProfiles.ageRange,
        gender: respondentProfiles.gender,
        region: respondentProfiles.region,
        occupation: respondentProfiles.occupation,
        education: respondentProfiles.education,
        reputationScore: respondentProfiles.reputationScore,
        totalCompleted: respondentProfiles.totalCompleted,
      })
      .from(respondentProfiles)
      .where(eq(respondentProfiles.userId, respondentId))
      .limit(1);
    const profile = profileRows[0];

    // 取已上架且尚未填過的問卷（避免推薦已填過的）
    const availableSurveys = await this.db
      .select({
        id: surveys.id,
        title: surveys.title,
        description: surveys.description,
        rewardPoints: surveys.rewardPoints,
        targetCount: surveys.targetCount,
        completedCount: surveys.completedCount,
        expiresAt: surveys.expiresAt,
      })
      .from(surveys)
      .where(
        and(
          eq(surveys.status, 'published'),
          sql`${surveys.id} NOT IN (
            SELECT survey_id FROM survey_responses WHERE respondent_id = ${respondentId}
          )`,
        ),
      )
      .orderBy(desc(surveys.rewardPoints))
      .limit(20);

    // 取已 rewarded 的完成數
    const rewardedRows = await this.db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.respondentId, respondentId),
          eq(surveyResponses.status, 'rewarded'),
        ),
      );
    const completedCount = profile?.totalCompleted ?? rewardedRows[0]?.count ?? 0;

    // 取錢包餘額作為「累計收入」近似（含尚未提領的）
    const walletRows = await this.db
      .select({ cashBalance: wallets.cashBalance })
      .from(wallets)
      .where(eq(wallets.userId, respondentId))
      .limit(1);
    const totalEarned = walletRows[0]?.cashBalance ?? 0;

    if (availableSurveys.length === 0) {
      return {
        topPick: null,
        earnings: {
          completed: completedCount,
          totalEarned,
          weeklyPotential: 0,
        },
        tips: profile
          ? ['目前沒有符合的新問卷，請定期回來看看']
          : ['完善個人資料可以接收更多符合的問卷推薦'],
        generatedAt: new Date().toISOString(),
      };
    }

    const weeklyPotential = availableSurveys.slice(0, 7).reduce((sum, s) => sum + s.rewardPoints, 0);

    const prompt = this.buildPrompt(profile, availableSurveys);

    try {
      const result = await this.zai.jsonChat<{
        topPickId: string;
        reason: string;
        tips: string[];
      }>(
        '你是受試者的 AI 助手。根據受試者背景與可填問卷清單，挑出 1 個最適合的問卷' +
          '並用繁體中文簡短說明為什麼適合（≤ 50 字）。' +
          '另外給 2-3 條「賺更多獎勵的小技巧」。回 JSON。' +
          '禁編造，topPickId 必須是清單中存在的 ID。',
        prompt,
        { temperature: 0.5 },
      );

      const picked = availableSurveys.find((s) => s.id === result.topPickId) ?? availableSurveys[0];
      return {
        topPick: {
          surveyId: picked.id,
          title: picked.title,
          reward: picked.rewardPoints,
          reason: result.reason ?? '',
        },
        earnings: { completed: completedCount, totalEarned, weeklyPotential },
        tips: (result.tips ?? []).slice(0, 4),
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.logger.error('RespondentAssistant LLM failed', err);
      // fallback：直接挑獎勵最高
      const top = availableSurveys[0];
      return {
        topPick: {
          surveyId: top.id,
          title: top.title,
          reward: top.rewardPoints,
          reason: `這是目前可接案中獎勵最高的問卷（NT$${top.rewardPoints}）`,
        },
        earnings: { completed: completedCount, totalEarned, weeklyPotential },
        tips: [
          '完成個人資料可以接收到更符合的問卷推薦',
          '認真填答可提升信譽分，獲得更多優質問卷',
        ],
        generatedAt: new Date().toISOString(),
      };
    }
  }

  private buildPrompt(
    profile: {
      ageRange?: string | null;
      gender?: string | null;
      region?: string | null;
      occupation?: string | null;
      education?: string | null;
      reputationScore?: number | null;
      totalCompleted?: number | null;
    } | undefined,
    list: Array<{
      id: string;
      title: string;
      description: string | null;
      rewardPoints: number;
    }>,
  ): string {
    const lines: string[] = ['請從以下問卷清單中，挑出最適合該受試者的 1 份：', ''];
    if (profile) {
      lines.push('受試者背景：');
      if (profile.ageRange) lines.push(`  年齡層：${profile.ageRange}`);
      if (profile.gender) lines.push(`  性別：${profile.gender}`);
      if (profile.region) lines.push(`  居住地：${profile.region}`);
      if (profile.occupation) lines.push(`  職業：${profile.occupation}`);
      if (profile.education) lines.push(`  學歷：${profile.education}`);
      if (profile.reputationScore != null) lines.push(`  信譽分：${profile.reputationScore}`);
      if (profile.totalCompleted != null) lines.push(`  累計完成：${profile.totalCompleted} 份`);
    } else {
      lines.push('受試者背景：尚未填寫個人資料');
    }
    lines.push('');
    lines.push('可填問卷清單：');
    list.forEach((s) => {
      lines.push(`- ID: ${s.id} ｜ 「${s.title}」 ｜ 獎勵 NT$${s.rewardPoints}`);
      if (s.description) lines.push(`    說明：${s.description.slice(0, 80)}`);
    });
    lines.push('');
    lines.push('請回傳 JSON：');
    lines.push('{');
    lines.push('  "topPickId": "<清單中 1 個 ID>",');
    lines.push('  "reason": "為什麼適合（≤ 50 字）",');
    lines.push('  "tips": ["賺更多的技巧 1", "技巧 2"]');
    lines.push('}');

    return lines.join('\n');
  }
}
