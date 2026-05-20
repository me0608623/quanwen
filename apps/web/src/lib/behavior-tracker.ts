'use client';

/**
 * Behavior Tracker — Phase 2 of Quality Audit Pipeline
 *
 * 在受試者填問卷的整個 session 中無感蒐集行為訊號。
 * Submit 時把 collector.dump() 結果一起送到 backend，
 * 後端 QualityAuditService 會用這些訊號參與 Layer 1 評分。
 *
 * 設計原則：
 * - 不阻擋送出（warning only）
 * - 用 ref 而非 React state（避免 re-render）
 * - 自動 cleanup（unmount 時釋放 listener）
 */

export interface BehaviorLog {
  startedAt: string;          // ISO timestamp，filling 開始
  submittedAt?: string;       // ISO timestamp，submit 時填
  totalDurationMs: number;    // 填答總時長（ms）

  windowSwitchCount: number;  // visibilitychange (hidden) 次數
  totalHiddenMs: number;      // 累計離開頁面時間
  pasteEventCount: number;    // 開放題 paste 次數
  totalKeystrokes: number;    // 鍵盤輸入次數
  mouseMoveCount: number;     // 滑鼠移動事件數（採樣）

  // 每題作答時長（questionId → ms）
  perQuestionTimeMs: Record<string, number>;

  // 客戶端 user agent（debug 用）
  userAgent: string;
}

/**
 * 行為訊號蒐集器。
 *
 * Usage in React:
 * ```tsx
 * const trackerRef = useRef<BehaviorTracker | null>(null);
 * useEffect(() => {
 *   trackerRef.current = new BehaviorTracker();
 *   return () => trackerRef.current?.dispose();
 * }, []);
 *
 * // 進入某題時
 * trackerRef.current?.enterQuestion(questionId);
 *
 * // submit
 * const log = trackerRef.current?.dump();
 * submitMutation.mutate({ ...answers, startedAt: log.startedAt, behaviorLog: log });
 * ```
 */
export class BehaviorTracker {
  private startedAt = Date.now();
  private windowSwitchCount = 0;
  private totalHiddenMs = 0;
  private pasteEventCount = 0;
  private totalKeystrokes = 0;
  private mouseMoveCount = 0;

  private currentQuestionId: string | null = null;
  private currentQuestionEnteredAt: number = 0;
  private perQuestionTimeMs: Record<string, number> = {};

  private hiddenAt: number | null = null;
  private mouseMoveLastSampled = 0;
  private readonly MOUSE_SAMPLE_INTERVAL = 200; // 5/sec

  // bound handlers (for removeEventListener)
  private boundVisibilityChange = this.onVisibilityChange.bind(this);
  private boundPaste = this.onPaste.bind(this);
  private boundKeyDown = this.onKeyDown.bind(this);
  private boundMouseMove = this.onMouseMove.bind(this);

  private disposed = false;

  constructor() {
    if (typeof window === 'undefined') return;
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
    document.addEventListener('paste', this.boundPaste, true);
    document.addEventListener('keydown', this.boundKeyDown, true);
    document.addEventListener('mousemove', this.boundMouseMove, true);
  }

  private onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      this.windowSwitchCount++;
    } else if (document.visibilityState === 'visible' && this.hiddenAt !== null) {
      this.totalHiddenMs += Date.now() - this.hiddenAt;
      this.hiddenAt = null;
    }
  }

  private onPaste(e: Event) {
    // 只計算 input/textarea 內的 paste（過濾頁面其他元素）
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
      this.pasteEventCount++;
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    // 排除控制鍵
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') {
      this.totalKeystrokes++;
    }
  }

  private onMouseMove() {
    const now = Date.now();
    if (now - this.mouseMoveLastSampled > this.MOUSE_SAMPLE_INTERVAL) {
      this.mouseMoveCount++;
      this.mouseMoveLastSampled = now;
    }
  }

  /** 進入某題（呼叫時自動記錄上一題的停留時間）*/
  enterQuestion(questionId: string) {
    const now = Date.now();
    if (this.currentQuestionId && this.currentQuestionId !== questionId) {
      const dur = now - this.currentQuestionEnteredAt;
      this.perQuestionTimeMs[this.currentQuestionId] =
        (this.perQuestionTimeMs[this.currentQuestionId] ?? 0) + dur;
    }
    this.currentQuestionId = questionId;
    this.currentQuestionEnteredAt = now;
  }

  /** 結束最後一題的計時（submit 前呼叫一次）*/
  private finalizeCurrentQuestion() {
    if (this.currentQuestionId) {
      const dur = Date.now() - this.currentQuestionEnteredAt;
      this.perQuestionTimeMs[this.currentQuestionId] =
        (this.perQuestionTimeMs[this.currentQuestionId] ?? 0) + dur;
    }
  }

  /** Dump 完整 behavior log，submit 前呼叫 */
  dump(): BehaviorLog {
    this.finalizeCurrentQuestion();
    // 若 submit 時頁面 hidden，也算進去
    if (this.hiddenAt !== null) {
      this.totalHiddenMs += Date.now() - this.hiddenAt;
      this.hiddenAt = null;
    }
    const submittedAt = new Date();
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      submittedAt: submittedAt.toISOString(),
      totalDurationMs: submittedAt.getTime() - this.startedAt,
      windowSwitchCount: this.windowSwitchCount,
      totalHiddenMs: this.totalHiddenMs,
      pasteEventCount: this.pasteEventCount,
      totalKeystrokes: this.totalKeystrokes,
      mouseMoveCount: this.mouseMoveCount,
      perQuestionTimeMs: { ...this.perQuestionTimeMs },
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };
  }

  /** Cleanup（在 component unmount 時呼叫）*/
  dispose() {
    if (this.disposed || typeof window === 'undefined') return;
    document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    document.removeEventListener('paste', this.boundPaste, true);
    document.removeEventListener('keydown', this.boundKeyDown, true);
    document.removeEventListener('mousemove', this.boundMouseMove, true);
    this.disposed = true;
  }
}

/**
 * 評估行為訊號是否需要即時干預（給填答 UI 顯示 warning）
 * 回傳 null 表示無需干預。
 */
export function detectIntervention(log: Partial<BehaviorLog>): {
  type: 'too_fast' | 'window_switching' | 'paste_open_question' | 'idle';
  message: string;
} | null {
  if (log.pasteEventCount && log.pasteEventCount > 2) {
    return {
      type: 'paste_open_question',
      message: '系統偵測到多次複製貼上。請以自己的話作答，否則會被標記為可疑。',
    };
  }
  if (log.windowSwitchCount && log.windowSwitchCount > 3) {
    return {
      type: 'window_switching',
      message: '你已離開填答頁面多次。請專心作答以確保答案被採納。',
    };
  }
  return null;
}
