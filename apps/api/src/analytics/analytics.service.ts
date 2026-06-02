import { Injectable, Inject, Logger } from '@nestjs/common';
import { DB, type AppDb } from '../db';
import { eq, and, inArray } from 'drizzle-orm';
import { surveys, surveyQuestions, questionOptions, surveyResponses, responseAnswers } from '../db/schema';

/**
 * Analytics Service — 進階問卷統計分析
 *
 * 功能：
 * 1. 基本統計量（平均、中位數、眾數、標準差、最大最小值）
 * 2. 交叉分析（兩個選擇題的交叉矩陣 + Cramér's V）
 * 3. NPS 淨推薦值（將評分題轉為 NPS 計算）
 */

export interface DescriptiveStats {
  mean: number | null;
  median: number | null;
  mode: number | null;
  stddev: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface CrossTabCell {
  rowLabel: string;
  colLabel: string;
  count: number;
}

export interface CrossTabResult {
  questionA: { id: string; title: string };
  questionB: { id: string; title: string };
  rows: string[];
  cols: string[];
  matrix: number[][];
  cramersV: number | null;
}

export interface NpsResult {
  questionId: string;
  title: string;
  promoters: number;   // 9-10
  passives: number;    // 7-8
  detractors: number;  // 1-6
  total: number;
  nps: number | null;  // -100 ~ 100
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(DB) private readonly db: AppDb) {}

  /**
   * 驗證問卷存取權限
   */
  private async verifyAccess(surveyId: string, surveyorId: string) {
    const rows = await this.db
      .select({ surveyorId: surveys.surveyorId })
      .from(surveys)
      .where(eq(surveys.id, surveyId))
      .limit(1);

    if (!rows[0]) throw new Error('問卷不存在');
    if (rows[0].surveyorId !== surveyorId) throw new Error('無權存取此問卷');
  }

  /**
   * 取得評分題的描述統計
   */
  async getDescriptiveStats(surveyId: string, surveyorId: string, questionId: string): Promise<DescriptiveStats> {
    await this.verifyAccess(surveyId, surveyorId);

    const ratings = await this.db
      .select({ value: responseAnswers.ratingValue })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          eq(responseAnswers.questionId, questionId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    const values = ratings.map((r: { value: number | null }) => r.value).filter((v: number | null): v is number => v !== null);

    if (values.length === 0) {
      return { mean: null, median: null, mode: null, stddev: null, min: null, max: null, count: 0 };
    }

    const sorted = [...values].sort((a: number, b: number) => a - b);
    const sum = values.reduce((s: number, v: number) => s + v, 0);
    const mean = sum / values.length;

    // Median
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

    // Mode
    const freq = new Map<number, number>();
    for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
    let maxFreq = 0;
    let mode: number | null = null;
    for (const [val, count] of freq) {
      if (count > maxFreq) { maxFreq = count; mode = val; }
    }

    // Standard deviation
    const variance = values.reduce((s: number, v: number) => s + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    return {
      mean: Math.round(mean * 100) / 100,
      median,
      mode,
      stddev: Math.round(stddev * 100) / 100,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      count: values.length,
    };
  }

  /**
   * 交叉分析：兩個選擇題的交叉表 + Cramér's V
   */
  async getCrossTab(
    surveyId: string,
    surveyorId: string,
    questionAId: string,
    questionBId: string,
  ): Promise<CrossTabResult> {
    await this.verifyAccess(surveyId, surveyorId);

    // 取題目資訊
    const [qA, qB] = await Promise.all([
      this.db.select().from(surveyQuestions).where(eq(surveyQuestions.id, questionAId)).limit(1),
      this.db.select().from(surveyQuestions).where(eq(surveyQuestions.id, questionBId)).limit(1),
    ]);

    if (!qA[0] || !qB[0]) throw new Error('題目不存在');
    if (qA[0].type !== 'single_choice' || qB[0].type !== 'single_choice') {
      throw new Error('交叉分析僅支援單選題');
    }

    // 取選項
    const [optsA, optsB] = await Promise.all([
      this.db.select().from(questionOptions).where(eq(questionOptions.questionId, questionAId)).orderBy(questionOptions.sortOrder),
      this.db.select().from(questionOptions).where(eq(questionOptions.questionId, questionBId)).orderBy(questionOptions.sortOrder),
    ]);

    const labelsA = optsA.map((o: { label: string }) => o.label);
    const labelsB = optsB.map((o: { label: string }) => o.label);

    // 取所有回答（每個 response 同時有 A 和 B 的答案）
    const answersA = await this.db
      .select({ responseId: responseAnswers.responseId, selectedOptionIds: responseAnswers.selectedOptionIds })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          eq(responseAnswers.questionId, questionAId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    const answersB = await this.db
      .select({ responseId: responseAnswers.responseId, selectedOptionIds: responseAnswers.selectedOptionIds })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          eq(responseAnswers.questionId, questionBId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    // Build map: responseId -> optionId for each question
    const mapA = new Map<string, string>();
    for (const a of answersA) {
      const ids = a.selectedOptionIds as string[] | null;
      if (ids && ids.length > 0) mapA.set(a.responseId, ids[0]);
    }

    const mapB = new Map<string, string>();
    for (const a of answersB) {
      const ids = a.selectedOptionIds as string[] | null;
      if (ids && ids.length > 0) mapB.set(a.responseId, ids[0]);
    }

    // Build cross-tab matrix
    const matrix: number[][] = Array.from({ length: labelsA.length }, () =>
      Array.from({ length: labelsB.length }, () => 0),
    );

    let total = 0;
    for (const [responseId, optA] of mapA) {
      const optB = mapB.get(responseId);
      if (!optB) continue;

      const idxA = optsA.findIndex((o: { id: string }) => o.id === optA);
      const idxB = optsB.findIndex((o: { id: string }) => o.id === optB);
      if (idxA === -1 || idxB === -1) continue;

      matrix[idxA][idxB]++;
      total++;
    }

    // Cramér's V
    let cramersV: number | null = null;
    if (total > 0 && labelsA.length > 1 && labelsB.length > 1) {
      // Row sums, col sums
      const rowSums = matrix.map((row: number[]) => row.reduce((s: number, v: number) => s + v, 0));
      const colSums = labelsB.map((_: string, j: number) => matrix.reduce((s: number, row: number[]) => s + row[j], 0));

      let chi2 = 0;
      for (let i = 0; i < labelsA.length; i++) {
        for (let j = 0; j < labelsB.length; j++) {
          const expected = (rowSums[i] * colSums[j]) / total;
          if (expected > 0) {
            chi2 += (matrix[i][j] - expected) ** 2 / expected;
          }
        }
      }

      const k = Math.min(labelsA.length, labelsB.length);
      cramersV = Math.round(Math.sqrt(chi2 / (total * (k - 1))) * 1000) / 1000;
    }

    return {
      questionA: { id: questionAId, title: qA[0].title },
      questionB: { id: questionBId, title: qB[0].title },
      rows: labelsA,
      cols: labelsB,
      matrix,
      cramersV,
    };
  }

  /**
   * NPS 淨推薦值（評分題轉 NPS）
   * Promoters: 9-10, Passives: 7-8, Detractors: 1-6
   */
  async getNps(surveyId: string, surveyorId: string, questionId: string): Promise<NpsResult> {
    await this.verifyAccess(surveyId, surveyorId);

    const qRow = await this.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.id, questionId))
      .limit(1);

    if (!qRow[0]) throw new Error('題目不存在');
    if (qRow[0].type !== 'rating') throw new Error('NPS 僅支援評分題');

    const ratings = await this.db
      .select({ value: responseAnswers.ratingValue })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          eq(responseAnswers.questionId, questionId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    const values = ratings.map((r: { value: number | null }) => r.value).filter((v: number | null): v is number => v !== null);

    // Map to 1-10 scale if needed (rating might be 1-5)
    // For NPS we normalize: if max is 5, treat as 10-point (multiply by 2)
    // We'll detect the scale and map accordingly
    const maxVal = values.length > 0 ? Math.max(...values) : 5;
    const scale = maxVal <= 5 ? 2 : 1;
    const scaled = values.map((v: number) => v * scale);

    const promoters = scaled.filter((v: number) => v >= 9).length;
    const passives = scaled.filter((v: number) => v >= 7 && v <= 8).length;
    const detractors = scaled.filter((v: number) => v <= 6).length;
    const total = values.length;

    const nps = total > 0
      ? Math.round(((promoters - detractors) / total) * 100)
      : null;

    return {
      questionId,
      title: qRow[0].title,
      promoters,
      passives,
      detractors,
      total,
      nps,
    };
  }

  /**
   * 相關性分析：兩個評分題的 Pearson 相關係數
   */
  async getCorrelation(
    surveyId: string,
    surveyorId: string,
    questionAId: string,
    questionBId: string,
  ): Promise<{
    questionA: { id: string; title: string };
    questionB: { id: string; title: string };
    pearsonR: number | null;
    n: number;
    interpretation: string;
  }> {
    await this.verifyAccess(surveyId, surveyorId);

    const [qA, qB] = await Promise.all([
      this.db.select().from(surveyQuestions).where(eq(surveyQuestions.id, questionAId)).limit(1),
      this.db.select().from(surveyQuestions).where(eq(surveyQuestions.id, questionBId)).limit(1),
    ]);

    if (!qA[0] || !qB[0]) throw new Error('題目不存在');
    if (qA[0].type !== 'rating' || qB[0].type !== 'rating') {
      throw new Error('相關性分析僅支援評分題');
    }

    // 取得同時回答 A 和 B 的所有 response
    const answersA = await this.db
      .select({ responseId: responseAnswers.responseId, value: responseAnswers.ratingValue })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          eq(responseAnswers.questionId, questionAId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    const answersB = await this.db
      .select({ responseId: responseAnswers.responseId, value: responseAnswers.ratingValue })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          eq(responseAnswers.questionId, questionBId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    const mapA = new Map<string, number>();
    for (const a of answersA) {
      if (a.value !== null) mapA.set(a.responseId, a.value);
    }

    // 配對 (x, y)
    const pairs: [number, number][] = [];
    for (const b of answersB) {
      const aVal = mapA.get(b.responseId);
      if (aVal !== undefined && b.value !== null) {
        pairs.push([aVal, b.value]);
      }
    }

    const n = pairs.length;
    if (n < 2) {
      return {
        questionA: { id: questionAId, title: qA[0].title },
        questionB: { id: questionBId, title: qB[0].title },
        pearsonR: null,
        n,
        interpretation: '樣本數不足（需至少 2 筆配對）',
      };
    }

    const meanX = pairs.reduce((s: number, [x]: [number, number]) => s + x, 0) / n;
    const meanY = pairs.reduce((s: number, [, y]: [number, number]) => s + y, 0) / n;

    let sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (const [x, y] of pairs) {
      const dx = x - meanX;
      const dy = y - meanY;
      sumXY += dx * dy;
      sumX2 += dx * dx;
      sumY2 += dy * dy;
    }

    const denom = Math.sqrt(sumX2 * sumY2);
    const pearsonR = denom === 0 ? 0 : Math.round((sumXY / denom) * 1000) / 1000;

    const absR = Math.abs(pearsonR);
    const interpretation =
      absR >= 0.7 ? '強相關' :
      absR >= 0.4 ? '中度相關' :
      absR >= 0.2 ? '弱相關' :
      '幾乎無相關';

    return {
      questionA: { id: questionAId, title: qA[0].title },
      questionB: { id: questionBId, title: qB[0].title },
      pearsonR,
      n,
      interpretation,
    };
  }

  /**
   * 分群分析：根據回答者作答特徵自動分群
   * 使用簡單的 K-means（k=2~3）在評分題上分群
   */
  async getSegmentation(
    surveyId: string,
    surveyorId: string,
    k = 3,
  ): Promise<{
    segments: {
      label: string;
      count: number;
      avgRatings: Record<string, { questionTitle: string; avg: number }>;
    }[];
    totalRespondents: number;
  }> {
    await this.verifyAccess(surveyId, surveyorId);

    // 取得所有評分題
    const ratingQuestions = await this.db
      .select()
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.surveyId, surveyId),
          eq(surveyQuestions.type, 'rating'),
        ),
      );

    if (ratingQuestions.length === 0) {
      return { segments: [], totalRespondents: 0 };
    }

    const qIds = ratingQuestions.map((q: { id: string }) => q.id);

    // 取得所有評分回答
    const allAnswers = await this.db
      .select({
        responseId: responseAnswers.responseId,
        questionId: responseAnswers.questionId,
        value: responseAnswers.ratingValue,
      })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          inArray(responseAnswers.questionId, qIds),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      );

    // 構建 responseId -> vector
    const vectors = new Map<string, number[]>();
    const responseIds: string[] = [];

    for (const a of allAnswers) {
      if (a.value === null) continue;
      if (!vectors.has(a.responseId)) {
        vectors.set(a.responseId, new Array(qIds.length).fill(NaN));
        responseIds.push(a.responseId);
      }
      const qIdx = qIds.indexOf(a.questionId);
      if (qIdx !== -1) {
        vectors.get(a.responseId)![qIdx] = a.value;
      }
    }

    if (responseIds.length < k) {
      k = Math.max(2, responseIds.length);
    }

    // 只保留有至少一個有效值的 responses，並用均值填 NaN
    const dim = qIds.length;
    const colMeans: number[] = [];
    for (let d = 0; d < dim; d++) {
      const vals = responseIds
        .map((rid: string) => vectors.get(rid)![d])
        .filter((v: number) => !isNaN(v));
      colMeans.push(vals.length > 0 ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : 0);
    }

    const matrix: number[][] = responseIds.map((rid: string) =>
      vectors.get(rid)!.map((v: number, d: number) => (isNaN(v) ? colMeans[d] : v)),
    );

    // K-means (simple, k iterations max 20)
    const actualK = Math.min(k, responseIds.length);
    const centroids: number[][] = [];
    // 初始化：均匀选取
    const step = Math.floor(matrix.length / actualK);
    for (let i = 0; i < actualK; i++) {
      centroids.push([...matrix[i * step]]);
    }

    let assignments = new Array(matrix.length).fill(0);
    for (let iter = 0; iter < 20; iter++) {
      // Assign
      const newAssignments = matrix.map((row: number[]) => {
        let minDist = Infinity;
        let best = 0;
        for (let c = 0; c < centroids.length; c++) {
          let dist = 0;
          for (let d = 0; d < dim; d++) {
            dist += (row[d] - centroids[c][d]) ** 2;
          }
          if (dist < minDist) { minDist = dist; best = c; }
        }
        return best;
      });

      // Check convergence
      if (newAssignments.every((a: number, i: number) => a === assignments[i])) break;
      assignments = newAssignments;

      // Update centroids
      for (let c = 0; c < centroids.length; c++) {
        const members = matrix.filter((_: number[], i: number) => assignments[i] === c);
        if (members.length === 0) continue;
        for (let d = 0; d < dim; d++) {
          centroids[c][d] = members.reduce((s: number, m: number[]) => s + m[d], 0) / members.length;
        }
      }
    }

    // Build result
    const segments = centroids.map((centroid: number[], c: number) => {
      const members = responseIds.filter((_: string, i: number) => assignments[i] === c);
      const avgRatings: Record<string, { questionTitle: string; avg: number }> = {};
      for (let d = 0; d < dim; d++) {
        avgRatings[qIds[d]] = {
          questionTitle: ratingQuestions[d].title,
          avg: Math.round(centroid[d] * 100) / 100,
        };
      }

      // 根據整體平均分決定 label
      const overallAvg = centroid.reduce((s: number, v: number) => s + v, 0) / dim;
      const label =
        overallAvg >= 4 ? `高分群（平均 ${overallAvg.toFixed(1)}）` :
        overallAvg >= 3 ? `中分群（平均 ${overallAvg.toFixed(1)}）` :
        `低分群（平均 ${overallAvg.toFixed(1)}）`;

      return { label, count: members.length, avgRatings };
    });

    return {
      segments: segments.sort((a, b) => b.count - a.count),
      totalRespondents: responseIds.length,
    };
  }

  /**
   * 取得問卷所有評分題的描述統計（批次）
   */
  async getAllDescriptiveStats(surveyId: string, surveyorId: string): Promise<Record<string, DescriptiveStats>> {
    await this.verifyAccess(surveyId, surveyorId);

    const questions = await this.db
      .select()
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.surveyId, surveyId),
          inArray(surveyQuestions.type, ['rating']),
        ),
      );

    const result: Record<string, DescriptiveStats> = {};
    for (const q of questions) {
      result[q.id] = await this.getDescriptiveStats(surveyId, surveyorId, q.id);
    }
    return result;
  }
}
