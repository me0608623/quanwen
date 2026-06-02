import { Injectable } from '@nestjs/common';
import type { AnswerDto } from './dto/submit-response.dto';
import type { BehaviorLogDto } from './dto/submit-response.dto';

// 反作弊結果
export interface AntiCheatResult {
  score: number;        // 0-100，越高越可疑
  isSuspicious: boolean; // score >= 60 → 標記可疑，但不直接拒絕（留給人工複審）
  flags: string[];      // 可疑原因
}

// 每題最短填答時間（秒）
const MIN_SECONDS_PER_QUESTION = 3;
// 文字題最短字數（中文） - 改為可配置，預設 2
const DEFAULT_MIN_TEXT_LENGTH = 2;
// 文字題單題最短填答時間（秒） - 避免一兩秒就打完文字題
const MIN_SECONDS_PER_TEXT_QUESTION = 2;

// 鍵盤連續按鍵偵測
const KEYBOARD_PATTERNS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  '1234567890',
  'qwerasdfzxcv', // 左手直線
  'uiophjklbnm', // 右手直線
].map(p => p.toLowerCase());

@Injectable()
export class AntiCheatService {
  evaluate(
    answers: AnswerDto[],
    totalQuestions: number,
    fillDurationSeconds: number | null,
    behaviorLog?: BehaviorLogDto,
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

    // ─── 1.5 單題填答時間偵測（文字題過快）────────────────────────────────────
    if (behaviorLog?.perQuestionTimeMs) {
      const textQuestionIds = answers
        .filter((a) => a.textAnswer !== undefined && a.textAnswer !== null && a.textAnswer.trim().length > 0)
        .map((a) => a.questionId);

      let fastTextCount = 0;
      for (const qId of textQuestionIds) {
        const timeMs = behaviorLog.perQuestionTimeMs[qId];
        if (timeMs !== undefined && timeMs < MIN_SECONDS_PER_TEXT_QUESTION * 1000) {
          fastTextCount++;
        }
      }

      if (fastTextCount > 0) {
        const penalty = Math.min(fastTextCount * 15, 30);
        score += penalty;
        flags.push(`${fastTextCount} 題文字題填答時間過快（<${MIN_SECONDS_PER_TEXT_QUESTION}秒）`);
      }
    }

    // ─── 2. 文字題回答品質 ────────────────────────────────────────────────────
    const textAnswers = answers.filter((a) => a.textAnswer !== undefined && a.textAnswer !== null);
    if (textAnswers.length > 0) {
      // 2.1 最低字數檢查
      const tooShort = textAnswers.filter(
        (a) => (a.textAnswer?.trim().length ?? 0) < DEFAULT_MIN_TEXT_LENGTH,
      );
      if (tooShort.length === textAnswers.length) {
        score += 20;
        flags.push('所有文字題回答過短或空白');
      }

      // 2.2 重複字元偵測（'aaaaaaa', '12345678'）
      const repeatedCharAnswers = textAnswers.filter((a) => {
        const text = a.textAnswer?.trim() ?? '';
        if (text.length < 3) return false;
        // 檢查是否所有字元都相同
        const firstChar = text[0];
        return text.split('').every(c => c === firstChar);
      });
      if (repeatedCharAnswers.length > 0) {
        score += 30;
        flags.push(`偵測到重複字元填答（${repeatedCharAnswers.length} 題）`);
      }

      // 2.3 鍵盤連續按鍵偵測（asdfghjkl, qwertyuiop）
      const keyboardPatternAnswers = textAnswers.filter((a) => {
        const text = a.textAnswer?.trim().toLowerCase() ?? '';
        if (text.length < 4) return false;
        return KEYBOARD_PATTERNS.some(pattern => {
          // 檢查是否包含或等於鍵盤連續模式
          return text.includes(pattern) || pattern.includes(text);
        });
      });
      if (keyboardPatternAnswers.length > 0) {
        score += 25;
        flags.push(`偵測到鍵盤連續按鍵填答（${keyboardPatternAnswers.length} 題）`);
      }

      // 2.4 亂碼偵測（無意義的隨機字串）
      const gibberishAnswers = textAnswers.filter((a) => this.isGibberish(a.textAnswer?.trim() ?? ''));
      if (gibberishAnswers.length > 0) {
        score += 20;
        flags.push(`偵測到疑似亂碼填答（${gibberishAnswers.length} 題）`);
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

  /**
   * 檢測是否為亂碼
   * 使用簡單啟發式：
   * 1. 字元多樣性過低（但非重複同一字元）
   * 2. 包含過多特殊符號
   * 3. 無元音/常用字且字元分布均勻（隨機特徵）
   */
  private isGibberish(text: string): boolean {
    if (text.length < 4) return false;

    const trimmed = text.trim();
    if (trimmed.length < 4) return false;

    // 排除正常的表情符號、標點
    const normalPunctuations = /[,.!?;:，。！？；：]/g;
    const cleanText = trimmed.replace(normalPunctuations, '');
    if (cleanText.length < 4) return false;

    // 1. 特殊符號比例過高
    const specialChars = cleanText.replace(/[a-zA-Z\u4e00-\u9fa5\d]/g, '');
    const specialRatio = specialChars.length / cleanText.length;
    if (specialRatio > 0.4) {
      return true;
    }

    // 2. 無意義隨機序列（特徵：多種不常見的字元組合，無元音/常用字）
    const hasCommonChars = /[aeiouAEIOU的你了是我不在]/.test(cleanText);
    if (!hasCommonChars && cleanText.length > 5) {
      // 無常用字且長度 > 5，檢查隨機性
      const randomLikeScore = this.calculateRandomScore(cleanText);
      if (randomLikeScore > 0.65) {
        return true;
      }
    }

    // 3. 字元多樣性過低（排除全同字元，已在前面的邏輯處理）
    const uniqueChars = new Set(cleanText.split(''));
    const uniqueRatio = uniqueChars.size / cleanText.length;
    if (uniqueRatio < 0.25 && cleanText.length > 6) {
      return true;
    }

    return false;
  }

  /**
   * 計算字串的「隨機性」分數 (0-1)
   * 越接近 1 越像是隨機亂碼
   */
  private calculateRandomScore(text: string): number {
    if (text.length < 3) return 0;

    // 1. 相鄰字元的 Unicode 差異平均值
    let totalDiff = 0;
    for (let i = 1; i < text.length; i++) {
      totalDiff += Math.abs(text.charCodeAt(i) - text.charCodeAt(i - 1));
    }
    const avgDiff = totalDiff / (text.length - 1);

    // 正常中文平均差異 ~100-500，英文 ~10-50，隨機亂碼差異較大（>300）
    const diffScore = Math.min(avgDiff / 500, 1);

    // 2. 字元種類分布是否均勻（隨機串較均勻）
    const charCounts: Record<string, number> = {};
    for (const c of text) {
      charCounts[c] = (charCounts[c] || 0) + 1;
    }
    const counts = Object.values(charCounts);
    const entropy = -counts.map(c => c / text.length * Math.log2(c / text.length)).reduce((a, b) => a + b, 0);
    const maxEntropy = Math.log2(Math.min(text.length, 128));
    const entropyScore = maxEntropy > 0 ? entropy / maxEntropy : 0;

    // 綜合兩個特徵：熵權重較高
    return (diffScore * 0.3 + entropyScore * 0.7);
  }
}