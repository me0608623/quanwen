import { BadRequestException, ForbiddenException, Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DB, type AppDb } from '../db';
import { eq, and, inArray, sql, isNotNull } from 'drizzle-orm';
import { surveys, surveyQuestions, questionOptions, surveyResponses, responseAnswers } from '../db/schema';
import { welchTTest, oneWayAnova, multipleLinearRegression } from './stats-math';

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
  detractors: number;  // 0-6
  total: number;
  nps: number | null;  // -100 ~ 100
  scaleMin: number;
  scaleMax: number;
  normalizedToTenPointScale: boolean;
}

const SYNTHETIC_YES_NO_OPTIONS = [
  { id: 'yes', label: '是' },
  { id: 'no', label: '否' },
];

export interface ScaleReliabilityResult {
  itemCount: number;
  completeResponseCount: number;
  excludedIncompleteResponseCount: number;
  normalizedToCommonScale: boolean;
  cronbachAlpha: number | null;
  mcdonaldsOmega: number | null;
  interpretation: string;
  availableItems: Array<{
    questionId: string;
    title: string;
    reverseScored: boolean;
    selectedForScale: boolean;
  }>;
  items: Array<{
    questionId: string;
    title: string;
    mean: number | null;
    rawMean: number | null;
    reverseScored: boolean;
    selectedForScale: boolean;
    correctedItemTotalCorrelation: number | null;
    alphaIfDeleted: number | null;
  }>;
}

export interface GroupComparisonResult {
  ratingQuestion: { id: string; title: string };
  groupQuestion: { id: string; title: string };
  groups: Array<{ optionId: string; label: string; n: number; mean: number | null; stddev: number }>;
  test: {
    type: 't' | 'anova';
    statistic: number;
    df1: number;
    df2: number | null;
    p: number;
    effectSize: number | null;
    effectSizeLabel: string | null;
  } | null;
  interpretation: string;
}

export interface RegressionAnalysisResult {
  dependent: { id: string; title: string };
  predictors: Array<{
    id: string;
    title: string;
    coefficient: number | null;
    standardizedBeta: number | null;
    tStat: number | null;
    p: number | null;
  }>;
  intercept: number | null;
  rSquared: number | null;
  adjustedRSquared: number | null;
  n: number;
  interpretation: string;
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

export function calculateCronbachAlpha(rows: number[][]): number | null {
  if (rows.length < 2 || rows[0]?.length < 2) return null;
  const itemCount = rows[0].length;
  if (rows.some((row) => row.length !== itemCount)) return null;

  const itemVariance = Array.from({ length: itemCount }, (_, index) =>
    sampleVariance(rows.map((row) => row[index])),
  ).reduce((sum, variance) => sum + variance, 0);
  const totalVariance = sampleVariance(rows.map((row) => row.reduce((sum, value) => sum + value, 0)));
  if (totalVariance === 0) return null;

  return Math.round((itemCount / (itemCount - 1)) * (1 - itemVariance / totalVariance) * 1000) / 1000;
}

/**
 * McDonald's ω (omega total) via single-factor model estimated with power iteration.
 * Formula: ω = (Σλᵢ)² / ((Σλᵢ)² + Σδᵢᵢ)
 * where λᵢ are PCA loadings from the first principal component of the correlation matrix
 * and δᵢᵢ = 1 − λᵢ² is the unique (error) variance for each standardised item.
 */
export function calculateMcdonaldsOmega(rows: number[][]): number | null {
  if (rows.length < 2 || rows[0]?.length < 2) return null;
  const k = rows[0].length;
  if (rows.some((row) => row.length !== k)) return null;

  const n = rows.length;

  // Item means and variances
  const means = Array.from({ length: k }, (_, j) =>
    rows.reduce((sum, row) => sum + row[j], 0) / n,
  );
  const variances = Array.from({ length: k }, (_, j) => {
    const devSqSum = rows.reduce((sum, row) => sum + (row[j] - means[j]) ** 2, 0);
    return devSqSum / (n - 1);
  });

  if (variances.some((v) => v === 0)) return null;
  const stddevs = variances.map((v) => Math.sqrt(v));

  // Correlation matrix
  const corr: number[][] = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => {
      if (i === j) return 1;
      const cov = rows.reduce((sum, row) => sum + (row[i] - means[i]) * (row[j] - means[j]), 0) / (n - 1);
      return cov / (stddevs[i] * stddevs[j]);
    }),
  );

  // Power iteration: find the dominant eigenvector of the correlation matrix
  let vec = Array.from<number>({ length: k }).fill(1 / Math.sqrt(k));
  for (let iter = 0; iter < 200; iter++) {
    const next = Array.from({ length: k }, (_, i) =>
      corr[i].reduce((sum, cij, j) => sum + cij * vec[j], 0),
    );
    const norm = Math.sqrt(next.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return null;
    const nextNorm = next.map((v) => v / norm);
    const converged = nextNorm.every((v, i) => Math.abs(v - vec[i]) < 1e-10);
    vec = nextNorm;
    if (converged) break;
  }

  // Eigenvalue (Rayleigh quotient)
  const eigenvalue = vec.reduce(
    (sum, vi, i) => sum + vi * corr[i].reduce((s, cij, j) => s + cij * vec[j], 0),
    0,
  );
  if (eigenvalue <= 0) return null;

  // Factor loadings on the standardised (correlation matrix) scale: λᵢ = vᵢ * √eigenvalue
  const loadings = vec.map((vi) => vi * Math.sqrt(eigenvalue));

  // Unique variances: δᵢᵢ = max(0, 1 − λᵢ²)
  const uniqueVars = loadings.map((l) => Math.max(0, 1 - l * l));

  const sumLoadings = loadings.reduce((s, l) => s + l, 0);
  const sumUnique = uniqueVars.reduce((s, u) => s + u, 0);

  const denominator = sumLoadings ** 2 + sumUnique;
  if (denominator === 0) return null;

  const omega = sumLoadings ** 2 / denominator;
  if (!isFinite(omega) || omega < 0 || omega > 1) return null;

  return Math.round(omega * 1000) / 1000;
}

export function reverseScaleValue(value: number, min: number, max: number): number {
  return min + max - value;
}

export function normalizeScaleValue(value: number, min: number, max: number): number {
  return max > min ? (value - min) / (max - min) : value;
}

export function ratingScaleRange(config: unknown): { min: number; max: number } {
  const parsed = questionConfig(config);
  const rawMax = typeof parsed.maxRating === 'number' && Number.isFinite(parsed.maxRating)
    ? parsed.maxRating
    : 5;
  return {
    min: parsed.scaleStart === 0 ? 0 : 1,
    max: Math.max(2, Math.min(10, Math.round(rawMax))),
  };
}

function questionConfig(config: unknown): Record<string, unknown> {
  return typeof config === 'object' && config !== null && !Array.isArray(config)
    ? config as Record<string, unknown>
    : {};
}

export function withReverseScored(config: unknown, reverseScored: boolean): Record<string, unknown> {
  return { ...questionConfig(config), reverseScored };
}

function isReverseScored(config: unknown): boolean {
  return questionConfig(config).reverseScored === true;
}

export function withScaleSettings(config: unknown, reverseScored: boolean, selectedForScale: boolean): Record<string, unknown> {
  return { ...questionConfig(config), reverseScored, scaleIncluded: selectedForScale };
}

export function calculatePearsonCorrelation(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0);
  const leftSquared = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0);
  const rightSquared = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0);
  const denominator = Math.sqrt(leftSquared * rightSquared);
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
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

    if (!rows[0]) throw new NotFoundException('問卷不存在');
    if (rows[0].surveyorId !== surveyorId) throw new ForbiddenException('無權存取此問卷');
  }

  /**
   * 取得評分題的描述統計
   */
  async getDescriptiveStats(surveyId: string, surveyorId: string, questionId: string): Promise<DescriptiveStats> {
    await this.verifyAccess(surveyId, surveyorId);
    const [question] = await this.db
      .select({ type: surveyQuestions.type })
      .from(surveyQuestions)
      .where(and(eq(surveyQuestions.id, questionId), eq(surveyQuestions.surveyId, surveyId)))
      .limit(1);
    if (!question) throw new BadRequestException('題目不屬於此問卷');
    if (question.type !== 'rating') throw new BadRequestException('描述統計僅支援評分題');

    const [agg] = await this.db
      .select({
        mean: sql<number | null>`AVG(${responseAnswers.ratingValue})`,
        stddev: sql<number | null>`STDDEV_POP(${responseAnswers.ratingValue})`,
        min: sql<number | null>`MIN(${responseAnswers.ratingValue})`,
        max: sql<number | null>`MAX(${responseAnswers.ratingValue})`,
        count: sql<number>`COUNT(*)::int`,
        median: sql<number | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${responseAnswers.ratingValue})`,
        mode: sql<number | null>`MODE() WITHIN GROUP (ORDER BY ${responseAnswers.ratingValue})`,
      })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(responseAnswers.surveyId, surveyId),
          eq(responseAnswers.questionId, questionId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
          isNotNull(responseAnswers.ratingValue),
        ),
      );

    if (!agg || agg.count === 0) {
      return { mean: null, median: null, mode: null, stddev: null, min: null, max: null, count: 0 };
    }

    return {
      mean: agg.mean !== null ? Math.round(Number(agg.mean) * 100) / 100 : null,
      median: agg.median !== null ? Number(agg.median) : null,
      mode: agg.mode !== null ? Number(agg.mode) : null,
      stddev: agg.stddev !== null ? Math.round(Number(agg.stddev) * 100) / 100 : null,
      min: agg.min !== null ? Number(agg.min) : null,
      max: agg.max !== null ? Number(agg.max) : null,
      count: agg.count,
    };
  }

  async getScaleReliability(surveyId: string, surveyorId: string, questionIds?: string[], reverseQuestionIds?: string[]): Promise<ScaleReliabilityResult> {
    await this.verifyAccess(surveyId, surveyorId);

    const allItems = await this.db
      .select({ id: surveyQuestions.id, title: surveyQuestions.title, config: surveyQuestions.config })
      .from(surveyQuestions)
      .where(and(eq(surveyQuestions.surveyId, surveyId), eq(surveyQuestions.type, 'rating')))
      .orderBy(surveyQuestions.sortOrder);
    const scaleSelectionConfigured = allItems.some((item) => typeof questionConfig(item.config).scaleIncluded === 'boolean');
    const isSelectedForScale = (item: typeof allItems[number]) =>
      !scaleSelectionConfigured || questionConfig(item.config).scaleIncluded === true;
    const allowed = new Set(allItems.map((item) => item.id));
    if ([...(questionIds ?? []), ...(reverseQuestionIds ?? [])].some((id) => !allowed.has(id))) {
      throw new BadRequestException('量表分析只能選擇此問卷的評分題');
    }
    const selected = questionIds?.length ? new Set(questionIds) : null;
    const items = selected ? allItems.filter((item) => selected.has(item.id)) : allItems.filter(isSelectedForScale);
    const selectedItemIds = new Set(items.map((item) => item.id));
    if (reverseQuestionIds?.some((id) => !selectedItemIds.has(id))) {
      throw new BadRequestException('反向題必須先納入量表題組');
    }
    const reversed = new Set(
      reverseQuestionIds ?? allItems.filter((item) => isReverseScored(item.config)).map((item) => item.id),
    );
    const availableItems = allItems.map((item) => ({
      questionId: item.id,
      title: item.title,
      reverseScored: reversed.has(item.id),
      selectedForScale: selected ? selectedItemIds.has(item.id) : isSelectedForScale(item),
    }));
    const rangeFor = (item: typeof items[number]) => ratingScaleRange(item.config);
    const transform = (item: typeof items[number], value: number) => {
      const { min, max } = rangeFor(item);
      return reversed.has(item.id) ? reverseScaleValue(value, min, max) : value;
    };

    if (items.length < 2) {
      return {
        itemCount: items.length,
        completeResponseCount: 0,
        excludedIncompleteResponseCount: 0,
        normalizedToCommonScale: true,
        cronbachAlpha: null,
        mcdonaldsOmega: null,
        interpretation: '至少需要 2 題評分量表才能計算信度',
        availableItems,
        items: items.map((item) => ({
          questionId: item.id,
          title: item.title,
          mean: null,
          rawMean: null,
          reverseScored: reversed.has(item.id),
          selectedForScale: selected ? selectedItemIds.has(item.id) : isSelectedForScale(item),
          correctedItemTotalCorrelation: null,
          alphaIfDeleted: null,
        })),
      };
    }

    const [eligibleResponses, answers] = await Promise.all([
      this.db
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(
          and(
            eq(surveyResponses.surveyId, surveyId),
            inArray(surveyResponses.status, ['submitted', 'rewarded']),
          ),
        ),
      this.db
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
            inArray(surveyResponses.status, ['submitted', 'rewarded']),
            inArray(responseAnswers.questionId, items.map((item) => item.id)),
          ),
        ),
    ]);

    const byResponse = new Map<string, Map<string, number>>();
    for (const answer of answers) {
      if (answer.value === null) continue;
      const row = byResponse.get(answer.responseId) ?? new Map<string, number>();
      row.set(answer.questionId, answer.value);
      byResponse.set(answer.responseId, row);
    }
    const completeAnswerRows = [...byResponse.values()]
      .filter((row) => items.every((item) => row.has(item.id)));
    const displayRows = completeAnswerRows
      .map((row) => items.map((item) => transform(item, row.get(item.id)!)));
    const rawDisplayRows = completeAnswerRows
      .map((row) => items.map((item) => row.get(item.id)!));
    const scoredRows = displayRows.map((row) =>
      row.map((value, index) => {
        const { min, max } = rangeFor(items[index]);
        return normalizeScaleValue(value, min, max);
      }),
    );
    const cronbachAlpha = calculateCronbachAlpha(scoredRows);
    const mcdonaldsOmega = calculateMcdonaldsOmega(scoredRows);
    const interpretation = cronbachAlpha === null
      ? '完整樣本不足或回答沒有變異，暫時無法計算'
      : cronbachAlpha >= 0.9
        ? '極佳信度'
        : cronbachAlpha >= 0.8
          ? '良好信度'
          : cronbachAlpha >= 0.7
            ? '可接受信度'
            : cronbachAlpha >= 0.6
              ? '信度偏低，建議檢查題目'
              : '信度不足，建議重新檢視量表';

    return {
      itemCount: items.length,
      completeResponseCount: scoredRows.length,
      excludedIncompleteResponseCount: eligibleResponses.length - scoredRows.length,
      normalizedToCommonScale: true,
      cronbachAlpha,
      mcdonaldsOmega,
      interpretation,
      availableItems,
      items: items.map((item, index) => {
        const values = scoredRows.map((row) => row[index]);
        const displayValues = displayRows.map((row) => row[index]);
        const rawDisplayValues = rawDisplayRows.map((row) => row[index]);
        const rowsWithoutItem = scoredRows.map((row) => row.filter((_, itemIndex) => itemIndex !== index));
        const totalsWithoutItem = rowsWithoutItem.map((row) => row.reduce((sum, value) => sum + value, 0));
        return {
          questionId: item.id,
          title: item.title,
          reverseScored: reversed.has(item.id),
          selectedForScale: selected ? selectedItemIds.has(item.id) : isSelectedForScale(item),
          correctedItemTotalCorrelation: calculatePearsonCorrelation(values, totalsWithoutItem),
          alphaIfDeleted: calculateCronbachAlpha(rowsWithoutItem),
          mean: displayValues.length === 0
            ? null
            : Math.round((displayValues.reduce((sum, value) => sum + value, 0) / displayValues.length) * 100) / 100,
          rawMean: rawDisplayValues.length === 0
            ? null
            : Math.round((rawDisplayValues.reduce((sum, value) => sum + value, 0) / rawDisplayValues.length) * 100) / 100,
        };
      }),
    };
  }

  async updateScaleSettings(
    surveyId: string,
    surveyorId: string,
    questionIds: string[],
    reverseQuestionIds: string[],
  ): Promise<ScaleReliabilityResult> {
    await this.verifyAccess(surveyId, surveyorId);

    const items = await this.db
      .select({ id: surveyQuestions.id, config: surveyQuestions.config })
      .from(surveyQuestions)
      .where(and(eq(surveyQuestions.surveyId, surveyId), eq(surveyQuestions.type, 'rating')));
    const selected = new Set(questionIds);
    const reversed = new Set(reverseQuestionIds);
    const allowed = new Set(items.map((item) => item.id));
    if ([...questionIds, ...reverseQuestionIds].some((id) => !allowed.has(id))) {
      throw new BadRequestException('量表設定只能選擇此問卷的評分題');
    }
    if (reverseQuestionIds.some((id) => !selected.has(id))) {
      throw new BadRequestException('反向題必須先納入量表題組');
    }
    if (items.length >= 2 && questionIds.length < 2) {
      throw new BadRequestException('量表題組至少需要 2 題評分題');
    }

    await this.db.transaction(async (tx) => {
      await Promise.all(items.map((item) =>
        tx
          .update(surveyQuestions)
          .set({ config: withScaleSettings(item.config, reversed.has(item.id), selected.has(item.id)) })
          .where(eq(surveyQuestions.id, item.id)),
      ));
    });

    return this.getScaleReliability(surveyId, surveyorId);
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
    if (questionAId === questionBId) throw new BadRequestException('交叉分析必須選擇兩個不同題目');

    // 取題目資訊
    const [qA, qB] = await Promise.all([
      this.db.select().from(surveyQuestions).where(and(eq(surveyQuestions.id, questionAId), eq(surveyQuestions.surveyId, surveyId))).limit(1),
      this.db.select().from(surveyQuestions).where(and(eq(surveyQuestions.id, questionBId), eq(surveyQuestions.surveyId, surveyId))).limit(1),
    ]);

    if (!qA[0] || !qB[0]) throw new BadRequestException('題目不屬於此問卷');
    if (qA[0].type !== 'single_choice' || qB[0].type !== 'single_choice') {
      throw new BadRequestException('交叉分析僅支援單選題');
    }

    // 取選項
    const [persistedOptsA, persistedOptsB] = await Promise.all([
      this.db.select().from(questionOptions).where(eq(questionOptions.questionId, questionAId)).orderBy(questionOptions.sortOrder),
      this.db.select().from(questionOptions).where(eq(questionOptions.questionId, questionBId)).orderBy(questionOptions.sortOrder),
    ]);
    const optsA = questionConfig(qA[0].config).variant === 'yes_no' ? SYNTHETIC_YES_NO_OPTIONS : persistedOptsA;
    const optsB = questionConfig(qB[0].config).variant === 'yes_no' ? SYNTHETIC_YES_NO_OPTIONS : persistedOptsB;

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
   * Promoters: 9-10, Passives: 7-8, Detractors: 0-6
   */
  async getNps(surveyId: string, surveyorId: string, questionId: string): Promise<NpsResult> {
    await this.verifyAccess(surveyId, surveyorId);

    const qRow = await this.db
      .select()
      .from(surveyQuestions)
      .where(and(eq(surveyQuestions.id, questionId), eq(surveyQuestions.surveyId, surveyId)))
      .limit(1);

    if (!qRow[0]) throw new BadRequestException('題目不屬於此問卷');
    if (qRow[0].type !== 'rating') throw new BadRequestException('NPS 僅支援評分題');

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

    // Normalize the configured scale to 10 points. Observed values cannot
    // determine the scale because an early 10-point sample may contain only lows.
    const { min, max } = ratingScaleRange(qRow[0].config);
    const scaled = values.map((v: number) => normalizeScaleValue(v, min, max) * 10);

    const promoters = scaled.filter((v: number) => v >= 9).length;
    const passives = scaled.filter((v: number) => v >= 7 && v < 9).length;
    const detractors = scaled.filter((v: number) => v < 7).length;
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
      scaleMin: min,
      scaleMax: max,
      normalizedToTenPointScale: min !== 0 || max !== 10,
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
    if (questionAId === questionBId) throw new BadRequestException('相關性分析必須選擇兩個不同題目');

    const [qA, qB] = await Promise.all([
      this.db.select().from(surveyQuestions).where(and(eq(surveyQuestions.id, questionAId), eq(surveyQuestions.surveyId, surveyId))).limit(1),
      this.db.select().from(surveyQuestions).where(and(eq(surveyQuestions.id, questionBId), eq(surveyQuestions.surveyId, surveyId))).limit(1),
    ]);

    if (!qA[0] || !qB[0]) throw new BadRequestException('題目不屬於此問卷');
    if (qA[0].type !== 'rating' || qB[0].type !== 'rating') {
      throw new BadRequestException('相關性分析僅支援評分題');
    }

    // 單一 SQL CORR() 查詢取代兩次全量載入 + JS Pearson 計算
    const corrResult = await this.db.execute<{ pearsonr: number | null; n: number }>(sql`
      SELECT
        CORR(a.rating_value, b.rating_value)::float AS pearsonr,
        COUNT(*)::int AS n
      FROM response_answers a
      JOIN survey_responses sr ON a.response_id = sr.id
      JOIN response_answers b ON a.response_id = b.response_id
      WHERE a.survey_id = ${surveyId}
        AND a.question_id = ${questionAId}
        AND b.question_id = ${questionBId}
        AND sr.status IN ('submitted', 'rewarded')
        AND a.rating_value IS NOT NULL
        AND b.rating_value IS NOT NULL
    `);

    const row = corrResult.rows[0];
    const n = Number(row?.n ?? 0);

    if (n < 2) {
      return {
        questionA: { id: questionAId, title: qA[0].title },
        questionB: { id: questionBId, title: qB[0].title },
        pearsonR: null,
        n,
        interpretation: '樣本數不足（需至少 2 筆配對）',
      };
    }

    const rawR = row?.pearsonr;
    if (rawR === null || rawR === undefined) {
      return {
        questionA: { id: questionAId, title: qA[0].title },
        questionB: { id: questionBId, title: qB[0].title },
        pearsonR: null,
        n,
        interpretation: '回答沒有變異，無法計算相關係數',
      };
    }

    const pearsonR = Math.round(Number(rawR) * 1000) / 1000;
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
   * 使用簡單的 K-means 在「評分題（標準化 0-1）+ 選擇題（one-hot 編碼）」混合特徵向量上分群。
   * 2026-06-06 擴充：原本只支援評分題，純選擇題問卷會回空結果（看起來像壞掉）；
   * 現在選擇題每個選項展開成一個 0/1 維度，各群輸出「選項輪廓」（choiceProfiles）。
   */
  async getSegmentation(
    surveyId: string,
    surveyorId: string,
    k = 3,
  ): Promise<{
    segments: {
      segmentId: string;
      label: string;
      count: number;
      avgRatings: Record<string, {
        questionTitle: string;
        avg: number | null;
        scaleMin: number;
        scaleMax: number;
        relativeAvg: number | null;
        answeredCount: number;
      }>;
      choiceProfiles: Record<string, {
        questionTitle: string;
        topOptions: { label: string; pct: number }[];
      }>;
    }[];
    totalRespondents: number;
    normalizedToCommonScale: boolean;
  }> {
    await this.verifyAccess(surveyId, surveyorId);
    if (!Number.isInteger(k) || k < 2 || k > 10) {
      throw new BadRequestException('分群數 k 必須是 2 至 10 的整數');
    }

    // 取得可分群題型：評分題 + 單/多選題
    const allQuestions = await this.db
      .select()
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.surveyId, surveyId),
          inArray(surveyQuestions.type, ['rating', 'single_choice', 'multiple_choice']),
        ),
      )
      .orderBy(surveyQuestions.sortOrder);

    const ratingQuestions = allQuestions.filter((q) => q.type === 'rating');
    const choiceQuestions = allQuestions.filter((q) => q.type !== 'rating');

    if (allQuestions.length === 0) {
      return { segments: [], totalRespondents: 0, normalizedToCommonScale: true };
    }

    // 選擇題選項（one-hot 維度）
    const choiceQIds = choiceQuestions.map((q) => q.id);
    const choiceOptions = choiceQIds.length > 0
      ? await this.db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, choiceQIds))
          .orderBy(questionOptions.questionId, questionOptions.sortOrder)
      : [];
    // optionId -> one-hot 維度索引（接在評分維度之後）
    const optionDimIndex = new Map<string, number>();
    for (const opt of choiceOptions) {
      optionDimIndex.set(opt.id, ratingQuestions.length + optionDimIndex.size);
    }
    const optionById = new Map(choiceOptions.map((o) => [o.id, o]));

    const qIds = ratingQuestions.map((q: { id: string }) => q.id);
    const allQIds = [...qIds, ...choiceQIds];

    // 隨機抽樣最多 5000 筆 response，避免 k-means 把全量資料載入記憶體造成 OOM
    const SEGMENTATION_SAMPLE_LIMIT = 5000;
    const sampledResponses = await this.db
      .select({ id: surveyResponses.id })
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.surveyId, surveyId),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
        ),
      )
      .orderBy(sql`RANDOM()`)
      .limit(SEGMENTATION_SAMPLE_LIMIT);

    const sampledIds = sampledResponses.map((r) => r.id);

    if (sampledIds.length === 0) {
      return { segments: [], totalRespondents: 0, normalizedToCommonScale: true };
    }

    // 只取抽樣到的 response 的回答，無需再 JOIN survey_responses（sampledIds 已過濾）
    const allAnswers = await this.db
      .select({
        responseId: responseAnswers.responseId,
        questionId: responseAnswers.questionId,
        value: responseAnswers.ratingValue,
        selectedOptionIds: responseAnswers.selectedOptionIds,
      })
      .from(responseAnswers)
      .where(
        and(
          inArray(responseAnswers.responseId, sampledIds),
          inArray(responseAnswers.questionId, allQIds),
        ),
      );

    // 構建 responseId -> vector（評分維度 NaN = 未答；one-hot 維度 0 = 未選）
    const dim = ratingQuestions.length + optionDimIndex.size;
    const vectors = new Map<string, number[]>();
    const responseIds: string[] = [];

    const ensureVector = (responseId: string) => {
      if (!vectors.has(responseId)) {
        const v = new Array(dim).fill(0);
        for (let d = 0; d < ratingQuestions.length; d++) v[d] = NaN;
        vectors.set(responseId, v);
        responseIds.push(responseId);
      }
      return vectors.get(responseId)!;
    };

    for (const a of allAnswers) {
      const qIdx = qIds.indexOf(a.questionId);
      if (qIdx !== -1) {
        if (a.value === null) continue;
        const { min, max } = ratingScaleRange(ratingQuestions[qIdx].config);
        ensureVector(a.responseId)[qIdx] = normalizeScaleValue(a.value, min, max);
        continue;
      }
      // 選擇題：one-hot
      const selected = Array.isArray(a.selectedOptionIds) ? (a.selectedOptionIds as string[]) : [];
      if (selected.length === 0) continue;
      const v = ensureVector(a.responseId);
      for (const optId of selected) {
        const dimIdx = optionDimIndex.get(optId);
        if (dimIdx !== undefined) v[dimIdx] = 1;
      }
    }

    if (responseIds.length < k) {
      k = Math.max(2, responseIds.length);
    }

    // 評分維度用均值填 NaN（one-hot 維度本來就是 0/1，不需填補）
    const colMeans: number[] = [];
    for (let d = 0; d < ratingQuestions.length; d++) {
      const vals = responseIds
        .map((rid: string) => vectors.get(rid)![d])
        .filter((v: number) => !isNaN(v));
      colMeans.push(vals.length > 0 ? vals.reduce((s: number, v: number) => s + v, 0) / vals.length : 0);
    }

    const matrix: number[][] = responseIds.map((rid: string) =>
      vectors.get(rid)!.map((v: number, d: number) => (isNaN(v) ? colMeans[d] : v)),
    );

    if (responseIds.length === 0) {
      return { segments: [], totalRespondents: 0, normalizedToCommonScale: true };
    }

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

    // 全體各選項選取率（用於找出各群「最有區辨力」的選項當標籤）
    const overallOptionPct = new Map<string, number>();
    for (const [optId, dimIdx] of optionDimIndex) {
      const sum = matrix.reduce((s: number, row: number[]) => s + row[dimIdx], 0);
      overallOptionPct.set(optId, matrix.length > 0 ? sum / matrix.length : 0);
    }

    // Build result
    const segments = centroids.map((centroid: number[], c: number) => {
      const members = responseIds.filter((_: string, i: number) => assignments[i] === c);
      const memberRows = matrix.filter((_: number[], i: number) => assignments[i] === c);
      const avgRatings: Record<string, {
        questionTitle: string;
        avg: number | null;
        scaleMin: number;
        scaleMax: number;
        relativeAvg: number | null;
        answeredCount: number;
      }> = {};
      for (let d = 0; d < ratingQuestions.length; d++) {
        const { min, max } = ratingScaleRange(ratingQuestions[d].config);
        const observedValues = responseIds
          .filter((_: string, index: number) => assignments[index] === c)
          .map((responseId: string) => vectors.get(responseId)![d])
          .filter((value: number) => !isNaN(value));
        const relativeAvg = observedValues.length === 0
          ? null
          : observedValues.reduce((sum: number, value: number) => sum + value, 0) / observedValues.length;
        const originalScaleAverage = relativeAvg === null ? null : min + relativeAvg * (max - min);
        avgRatings[qIds[d]] = {
          questionTitle: ratingQuestions[d].title,
          avg: originalScaleAverage === null ? null : Math.round(originalScaleAverage * 100) / 100,
          scaleMin: min,
          scaleMax: max,
          relativeAvg: relativeAvg === null ? null : Math.round(relativeAvg * 1000) / 1000,
          answeredCount: observedValues.length,
        };
      }

      // 各群選項輪廓：每個選擇題列出本群選取率最高的前 2 個選項
      const choiceProfiles: Record<string, {
        questionTitle: string;
        topOptions: { label: string; pct: number }[];
      }> = {};
      let distinctiveLabel: string | null = null;
      let distinctiveLift = 0;
      for (const q of choiceQuestions) {
        const opts = choiceOptions.filter((o) => o.questionId === q.id);
        const ranked = opts
          .map((o) => {
            const dimIdx = optionDimIndex.get(o.id)!;
            const pct = memberRows.length > 0
              ? memberRows.reduce((s: number, row: number[]) => s + row[dimIdx], 0) / memberRows.length
              : 0;
            return { label: o.label, pct: Math.round(pct * 1000) / 1000, lift: pct - (overallOptionPct.get(o.id) ?? 0) };
          })
          .sort((a, b) => b.pct - a.pct);
        choiceProfiles[q.id] = {
          questionTitle: q.title,
          topOptions: ranked.slice(0, 2).map(({ label, pct }) => ({ label, pct })),
        };
        // 區辨力 = 本群選取率 − 全體選取率，取最大者當群標籤
        for (const r of ranked) {
          if (r.lift > distinctiveLift) {
            distinctiveLift = r.lift;
            distinctiveLabel = r.label;
          }
        }
      }

      // 群標籤：有評分題 → 沿用高/中/低分群；純選擇題 → 用最有區辨力的選項
      let label: string;
      if (ratingQuestions.length > 0) {
        const ratingCentroid = centroid.slice(0, ratingQuestions.length);
        const overallAvg = ratingCentroid.reduce((s: number, v: number) => s + v, 0) / ratingQuestions.length;
        label =
          overallAvg >= 0.7 ? `高分群（相對 ${Math.round(overallAvg * 100)}%）` :
          overallAvg >= 0.4 ? `中分群（相對 ${Math.round(overallAvg * 100)}%）` :
          `低分群（相對 ${Math.round(overallAvg * 100)}%）`;
      } else if (distinctiveLabel) {
        const short = distinctiveLabel.length > 12 ? `${distinctiveLabel.slice(0, 12)}…` : distinctiveLabel;
        label = `群 ${c + 1}・傾向「${short}」`;
      } else {
        label = `群 ${c + 1}`;
      }

      return { segmentId: `segment-${c + 1}`, label, count: members.length, avgRatings, choiceProfiles };
    });

    return {
      segments: segments.sort((a, b) => b.count - a.count),
      totalRespondents: responseIds.length,
      normalizedToCommonScale: true,
    };
  }

  /**
   * 差異性分析：以一個單選題分組，比較各組在某評分題的平均差異。
   * 2 組 → Welch 兩樣本 t 檢定；≥3 組 → 單因子 ANOVA。
   */
  async getGroupComparison(
    surveyId: string,
    surveyorId: string,
    ratingQuestionId: string,
    groupQuestionId: string,
  ): Promise<GroupComparisonResult> {
    await this.verifyAccess(surveyId, surveyorId);
    if (ratingQuestionId === groupQuestionId) {
      throw new BadRequestException('評分題與分組題必須不同');
    }

    const [ratingQ, groupQ] = await Promise.all([
      this.db.select().from(surveyQuestions).where(and(eq(surveyQuestions.id, ratingQuestionId), eq(surveyQuestions.surveyId, surveyId))).limit(1),
      this.db.select().from(surveyQuestions).where(and(eq(surveyQuestions.id, groupQuestionId), eq(surveyQuestions.surveyId, surveyId))).limit(1),
    ]);
    if (!ratingQ[0] || !groupQ[0]) throw new BadRequestException('題目不屬於此問卷');
    if (ratingQ[0].type !== 'rating') throw new BadRequestException('差異性分析的依變數必須是評分題');
    if (groupQ[0].type !== 'single_choice') throw new BadRequestException('分組題必須是單選題');

    const persistedOpts = await this.db.select().from(questionOptions).where(eq(questionOptions.questionId, groupQuestionId)).orderBy(questionOptions.sortOrder);
    const groupOpts = questionConfig(groupQ[0].config).variant === 'yes_no' ? SYNTHETIC_YES_NO_OPTIONS : persistedOpts;
    const labelById = new Map(groupOpts.map((o: { id: string; label: string }) => [o.id, o.label]));

    const [ratingAnswers, groupAnswers] = await Promise.all([
      this.db
        .select({ responseId: responseAnswers.responseId, value: responseAnswers.ratingValue })
        .from(responseAnswers)
        .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
        .where(and(eq(surveyResponses.surveyId, surveyId), eq(responseAnswers.questionId, ratingQuestionId), inArray(surveyResponses.status, ['submitted', 'rewarded']))),
      this.db
        .select({ responseId: responseAnswers.responseId, selectedOptionIds: responseAnswers.selectedOptionIds })
        .from(responseAnswers)
        .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
        .where(and(eq(surveyResponses.surveyId, surveyId), eq(responseAnswers.questionId, groupQuestionId), inArray(surveyResponses.status, ['submitted', 'rewarded']))),
    ]);

    const ratingByResponse = new Map<string, number>();
    for (const a of ratingAnswers) if (a.value !== null) ratingByResponse.set(a.responseId, a.value);

    // optionId -> 評分值陣列
    const valuesByOption = new Map<string, number[]>();
    for (const g of groupAnswers) {
      const ids = g.selectedOptionIds as string[] | null;
      if (!ids || ids.length === 0) continue;
      const value = ratingByResponse.get(g.responseId);
      if (value === undefined) continue;
      const optId = ids[0];
      const bucket = valuesByOption.get(optId) ?? [];
      bucket.push(value);
      valuesByOption.set(optId, bucket);
    }

    const groups = groupOpts
      .map((o: { id: string; label: string }) => {
        const values = valuesByOption.get(o.id) ?? [];
        const m = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
        const variance = values.length >= 2
          ? values.reduce((s, v) => s + (v - (m as number)) ** 2, 0) / (values.length - 1)
          : 0;
        return {
          optionId: o.id,
          label: labelById.get(o.id) ?? o.id,
          n: values.length,
          mean: m === null ? null : Math.round(m * 100) / 100,
          stddev: Math.round(Math.sqrt(variance) * 100) / 100,
          values,
        };
      })
      .filter((g) => g.n >= 2);

    const base = {
      ratingQuestion: { id: ratingQuestionId, title: ratingQ[0].title },
      groupQuestion: { id: groupQuestionId, title: groupQ[0].title },
      groups: groups.map(({ values, ...rest }) => rest),
    };

    if (groups.length < 2) {
      return { ...base, test: null, interpretation: '有效分組不足（每組至少需 2 筆評分），無法檢定差異' };
    }

    if (groups.length === 2) {
      const result = welchTTest(groups[0].values, groups[1].values);
      if (!result) return { ...base, test: null, interpretation: '資料變異不足，無法計算 t 檢定' };
      const significant = result.p < 0.05;
      return {
        ...base,
        test: { type: 't', statistic: result.t, df1: result.df, df2: null, p: result.p, effectSize: null, effectSizeLabel: null },
        interpretation: significant
          ? `兩組平均差異達統計顯著（t=${result.t}, p=${result.p}）：「${groups[0].label}」平均 ${groups[0].mean}，「${groups[1].label}」平均 ${groups[1].mean}。`
          : `兩組平均差異未達統計顯著（t=${result.t}, p=${result.p}），尚不能斷定有差異。`,
      };
    }

    const result = oneWayAnova(groups.map((g) => g.values));
    if (!result) return { ...base, test: null, interpretation: '資料變異不足，無法計算變異數分析' };
    const significant = result.p < 0.05;
    return {
      ...base,
      test: { type: 'anova', statistic: result.f, df1: result.df1, df2: result.df2, p: result.p, effectSize: result.etaSquared, effectSizeLabel: 'η²' },
      interpretation: significant
        ? `${groups.length} 組之間平均至少有一組顯著不同（F=${result.f}, p=${result.p}，η²=${result.etaSquared}）。`
        : `${groups.length} 組之間平均差異未達統計顯著（F=${result.f}, p=${result.p}）。`,
    };
  }

  /**
   * 複迴歸：以多個評分題（自變數）預測一個評分題（應變數），逐筆完整作答配對。
   */
  async getRegression(
    surveyId: string,
    surveyorId: string,
    dependentId: string,
    independentIds: string[],
  ): Promise<RegressionAnalysisResult> {
    await this.verifyAccess(surveyId, surveyorId);
    const uniqueIndependents = [...new Set(independentIds)].filter((id) => id !== dependentId);
    if (uniqueIndependents.length === 0) throw new BadRequestException('至少需要 1 個自變數，且不可與應變數相同');

    const allIds = [dependentId, ...uniqueIndependents];
    const questions = await this.db
      .select({ id: surveyQuestions.id, title: surveyQuestions.title, type: surveyQuestions.type })
      .from(surveyQuestions)
      .where(and(eq(surveyQuestions.surveyId, surveyId), inArray(surveyQuestions.id, allIds)));
    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const id of allIds) {
      const q = byId.get(id);
      if (!q) throw new BadRequestException('題目不屬於此問卷');
      if (q.type !== 'rating') throw new BadRequestException('迴歸分析僅支援評分題');
    }

    const answers = await this.db
      .select({ responseId: responseAnswers.responseId, questionId: responseAnswers.questionId, value: responseAnswers.ratingValue })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(and(eq(surveyResponses.surveyId, surveyId), inArray(responseAnswers.questionId, allIds), inArray(surveyResponses.status, ['submitted', 'rewarded'])));

    const byResponse = new Map<string, Map<string, number>>();
    for (const a of answers) {
      if (a.value === null) continue;
      const row = byResponse.get(a.responseId) ?? new Map<string, number>();
      row.set(a.questionId, a.value);
      byResponse.set(a.responseId, row);
    }

    const xRows: number[][] = [];
    const y: number[] = [];
    for (const row of byResponse.values()) {
      if (!allIds.every((id) => row.has(id))) continue;
      y.push(row.get(dependentId)!);
      xRows.push(uniqueIndependents.map((id) => row.get(id)!));
    }

    const predictorMeta = uniqueIndependents.map((id) => ({ id, title: byId.get(id)!.title }));
    const result = multipleLinearRegression(xRows, y);
    if (!result) {
      return {
        dependent: { id: dependentId, title: byId.get(dependentId)!.title },
        predictors: predictorMeta.map((p) => ({ ...p, coefficient: null, standardizedBeta: null, tStat: null, p: null })),
        intercept: null,
        rSquared: null,
        adjustedRSquared: null,
        n: y.length,
        interpretation: `完整配對樣本不足（目前 ${y.length} 筆，需大於自變數數 + 1），暫時無法估計迴歸。`,
      };
    }

    const coefByIndex = new Map(result.coefficients.filter((c) => c.index !== null).map((c) => [c.index as number, c]));
    const predictors = predictorMeta.map((p, i) => {
      const c = coefByIndex.get(i);
      return {
        ...p,
        coefficient: c?.coefficient ?? null,
        standardizedBeta: c?.standardizedBeta ?? null,
        tStat: c?.tStat ?? null,
        p: c?.p ?? null,
      };
    });
    const fitLabel = result.rSquared >= 0.5 ? '強' : result.rSquared >= 0.25 ? '中等' : '弱';
    const sigPredictors = predictors.filter((p) => p.p !== null && p.p < 0.05);
    return {
      dependent: { id: dependentId, title: byId.get(dependentId)!.title },
      predictors,
      intercept: result.intercept,
      rSquared: result.rSquared,
      adjustedRSquared: result.adjustedRSquared,
      n: result.n,
      interpretation:
        `模型解釋了應變數約 ${Math.round(result.rSquared * 100)}% 的變異（R²=${result.rSquared}，調整後 ${result.adjustedRSquared}），整體解釋力${fitLabel}。` +
        (sigPredictors.length > 0
          ? `顯著預測變數：${sigPredictors.map((p) => `「${p.title}」(β=${p.standardizedBeta}, p=${p.p})`).join('、')}。`
          : '目前沒有達統計顯著的預測變數，建議增加樣本或檢視題目。'),
    };
  }

  /**
   * 取得問卷所有評分題的描述統計（批次）
   */
  async getAllDescriptiveStats(surveyId: string, surveyorId: string): Promise<Record<string, DescriptiveStats>> {
    await this.verifyAccess(surveyId, surveyorId);

    const questions = await this.db
      .select({ id: surveyQuestions.id })
      .from(surveyQuestions)
      .where(
        and(
          eq(surveyQuestions.surveyId, surveyId),
          eq(surveyQuestions.type, 'rating'),
        ),
      );

    // 預設：所有評分題都回傳空統計（count=0, nulls），有資料的再覆蓋
    const result: Record<string, DescriptiveStats> = {};
    for (const q of questions) {
      result[q.id] = { mean: null, median: null, mode: null, stddev: null, min: null, max: null, count: 0 };
    }

    if (questions.length === 0) return result;

    const qIds = questions.map((q) => q.id);

    // 單一 GROUP BY 查詢取代 N+1 次 getDescriptiveStats 呼叫
    const rows = await this.db
      .select({
        questionId: responseAnswers.questionId,
        mean: sql<number | null>`AVG(${responseAnswers.ratingValue})`,
        stddev: sql<number | null>`STDDEV_POP(${responseAnswers.ratingValue})`,
        min: sql<number | null>`MIN(${responseAnswers.ratingValue})`,
        max: sql<number | null>`MAX(${responseAnswers.ratingValue})`,
        count: sql<number>`COUNT(*)::int`,
        median: sql<number | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${responseAnswers.ratingValue})`,
        mode: sql<number | null>`MODE() WITHIN GROUP (ORDER BY ${responseAnswers.ratingValue})`,
      })
      .from(responseAnswers)
      .innerJoin(surveyResponses, eq(responseAnswers.responseId, surveyResponses.id))
      .where(
        and(
          eq(responseAnswers.surveyId, surveyId),
          inArray(responseAnswers.questionId, qIds),
          inArray(surveyResponses.status, ['submitted', 'rewarded']),
          isNotNull(responseAnswers.ratingValue),
        ),
      )
      .groupBy(responseAnswers.questionId);

    for (const row of rows) {
      result[row.questionId] = {
        mean: row.mean !== null ? Math.round(Number(row.mean) * 100) / 100 : null,
        median: row.median !== null ? Number(row.median) : null,
        mode: row.mode !== null ? Number(row.mode) : null,
        stddev: row.stddev !== null ? Math.round(Number(row.stddev) * 100) / 100 : null,
        min: row.min !== null ? Number(row.min) : null,
        max: row.max !== null ? Number(row.max) : null,
        count: row.count,
      };
    }

    return result;
  }
}
