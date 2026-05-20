import { Injectable } from '@nestjs/common';
import type { AnswerDto } from './dto/submit-response.dto';

// 反作弊結果
export interface AntiCheatResult {
  score: number;        // 0-100，越高越可疑
  isSuspicious: boolean; // score >= 60 → 標記可疑，但不直接拒絕（留給人工複審）
  flags: string[];      // 可疑原因
}

// 每題最短填答時間（秒）
const MIN_SECONDS_PER_QUESTION = 3;
// 文字題最短字數（中文）
const MIN_TEXT_LENGTH = 2;

@Injectable()
export class AntiCheatService {
  evaluate(
    answers: AnswerDto[],
    totalQuestions: number,
    fillDurationSeconds: number | null,
  ): AntiCheatResult {
    const flags: string[] = [];
    let score = 0;

    // ─── 1. 填答速度 ──────────────────────────────────────────────────────────
    if (fillDurationSeconds !== null) {
      const minExpected = totalQuestions * MIN_SECONDS_PER_QUESTION;
      if (fillDurationSeconds < minExpected) {
        const ratio = fillDurationSeconds / minExpected;
        if (ratio < 0.2) {
          score += 50;
          flags.push(`填答時間過短（${fillDurationSeconds}s，預期 ≥${minExpected}s）`);
        } else if (ratio < 0.5) {
          score += 25;
          flags.push(`填答時間偏短（${fillDurationSeconds}s）`);
        }
      }
    }

    // ─── 2. 文字題回答品質 ────────────────────────────────────────────────────
    const textAnswers = answers.filter((a) => a.textAnswer !== undefined && a.textAnswer !== null);
    if (textAnswers.length > 0) {
      const tooShort = textAnswers.filter(
        (a) => (a.textAnswer?.trim().length ?? 0) < MIN_TEXT_LENGTH,
      );
      if (tooShort.length === textAnswers.length) {
        score += 20;
        flags.push('所有文字題回答過短或空白');
      }
    }

    // ─── 3. 選擇題全選同一選項 ────────────────────────────────────────────────
    const choiceAnswers = answers.filter(
      (a) => a.selectedOptionIds && a.selectedOptionIds.length > 0,
    );
    if (choiceAnswers.length >= 3) {
      // 如果所有選擇題都只選一個選項且是同一個
      const allSingleOption = choiceAnswers.every((a) => a.selectedOptionIds?.length === 1);
      if (allSingleOption) {
        const allSameOption = new Set(
          choiceAnswers.map((a) => a.selectedOptionIds![0]),
        ).size === 1;
        if (allSameOption && choiceAnswers.length >= 4) {
          score += 15;
          flags.push('所有選擇題均選同一選項');
        }
      }
    }

    // ─── 4. 回答數量明顯不足 ──────────────────────────────────────────────────
    if (answers.length < totalQuestions * 0.5) {
      score += 15;
      flags.push(`回答題數（${answers.length}）遠少於總題數（${totalQuestions}）`);
    }

    return {
      score: Math.min(score, 100),
      isSuspicious: score >= 60,
      flags,
    };
  }
}
