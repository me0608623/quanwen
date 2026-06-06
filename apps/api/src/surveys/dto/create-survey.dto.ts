import { z } from 'zod';
import { LogicRuleSchema } from './logic-rule.dto';

export const QuestionOptionSchema = z.object({
  label: z.string().min(1).max(300),
  sortOrder: z.number().int().min(0).default(0),
});

export const SurveyQuestionSchema = z.object({
  type: z.enum(['single_choice', 'multiple_choice', 'text', 'rating', 'matrix']),
  title: z.string().min(1).max(1000),
  // nullish：讀取 API 對未填欄位回傳 null，需可 round-trip 回存
  description: z.string().max(500).nullish(),
  sortOrder: z.number().int().min(0).default(0),
  isRequired: z.boolean().default(true),
  // QUA-279: 題目圖片 URL（上傳後回傳的路徑）
  imageUrl: z.string().max(500).nullish(),
  config: z.record(z.string(), z.unknown()).optional(),
  options: z.array(QuestionOptionSchema).max(20).optional(),
}).superRefine((question, ctx) => {
  if (question.type !== 'rating' || !question.config) return;
  const { maxRating, scaleStart } = question.config;
  if (maxRating !== undefined && (!Number.isInteger(maxRating) || (maxRating as number) < 2 || (maxRating as number) > 10)) {
    ctx.addIssue({ code: 'custom', path: ['config', 'maxRating'], message: '評分題上限必須是 2 至 10 的整數' });
  }
  if (scaleStart !== undefined && scaleStart !== 0 && scaleStart !== 1) {
    ctx.addIssue({ code: 'custom', path: ['config', 'scaleStart'], message: '評分題起始值只能是 0 或 1' });
  }
});

// 樣式主題：問卷外觀設定，套用到填答頁與預覽。顏色限 #RGB / #RRGGBB
const HEX_COLOR = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, '顏色需為 #RRGGBB 格式');
export const SurveyThemeSchema = z.object({
  accentColor: HEX_COLOR.optional(),
  backgroundColor: HEX_COLOR.optional(),
  fontFamily: z.enum(['sans', 'serif', 'rounded']).optional(),
});

export const SURVEY_CATEGORIES = [
  'consumer', 'academic', 'wellness', 'workplace', 'lifestyle',
  'tech', 'social', 'education', 'finance', 'other',
] as const;

// 受眾鎖定條件（standard 問卷用）— 每個陣列為 OR、欄位間為 AND；空 = 不限
// 未知欄位由 Zod 預設 strip 掉，僅信任這裡列出的維度
export const AudienceCriteriaSchema = z.object({
  ageRange: z.array(z.string().max(20)).max(10).optional(),
  gender: z.array(z.string().max(20)).max(10).optional(),
  region: z.array(z.string().max(20)).max(30).optional(),
  occupation: z.array(z.string().max(30)).max(10).optional(),
  industry: z.array(z.string().max(40)).max(25).optional(),
  education: z.array(z.string().max(20)).max(10).optional(),
  minReputationScore: z.number().int().min(0).max(100).optional(),
  requiredTagIds: z.array(z.string().uuid()).max(20).optional(),
  tagMatchMode: z.enum(['any', 'all']).optional(),
});

export const CreateSurveyBaseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // standard = 走獎勵媒合；mutual = 互惠配對 (兩人互填)
  type: z.enum(['standard', 'mutual']).default('standard'),
  // 分類(optional): 提供 task list 過濾 + 未來 mutual 智慧媒合
  category: z.enum(SURVEY_CATEGORIES).optional(),
  // Phase C-2: 是否導入 AI 品質審核 (預設 true)
  aiReviewEnabled: z.boolean().default(true),
  // Phase C-3: 外部平台 (Google Forms / SurveyMonkey 等) 連結。
  // standard 與 mutual 皆可：非空 → 填答者跳轉至外部頁面，不在站內作答
  externalUrl: z.string().url().max(1000).refine(u => /^https?:\/\//i.test(u), { message: 'URL 必須使用 http 或 https 協議' }).optional(),
  // 建立者填寫的預估填答分鐘數（外部問卷無題目可估算時必填；站內問卷可選填）
  estimatedMinutes: z.number().int().min(1).max(180).optional(),
  rewardPoints: z.number().int().min(0).max(1000).default(0),
  rewardMode: z.enum(['fixed', 'lottery']).optional(),
  lotteryPrize: z.string().trim().min(1).max(300).optional(),
  lotteryWinnerCount: z.number().int().min(1).max(1000).optional(),
  lotteryDrawMode: z.enum(['when_full', 'scheduled', 'manual']).optional(),
  lotteryDrawAt: z.string().datetime().optional(),
  lotteryTermsAccepted: z.boolean().optional(),
  targetCount: z.number().int().min(1).max(10000).default(100),
  expiresAt: z.string().datetime().optional(),
  // QUA-34: Rush delivery tier — controls rush multiplier on rewardPoints and default expiresAt
  // Optional; defaults to 'standard' (1.0x, 14 days) in SurveysService.create
  deadlineTier: z.enum(['standard', 'express', 'urgent', 'critical']).optional(),
  isAnonymous: z.boolean().default(true),
  // QUA-204: 問券層級題目順序隨機化 (none=不隨機, all=全部隨機, exceptLast=保留最後一題)
  questionShuffleMode: z.enum(['none', 'all', 'exceptLast']).optional(),
  // QUA-279: 問卷封面圖片（顯示在任務列表卡片背景）
  coverImageUrl: z.string().max(500).optional(),
  // 歡迎頁（作答第一頁）可插入的多張圖片，依序顯示於描述之後
  welcomeImages: z.array(z.string().max(500)).max(12).optional(),
  // 樣式主題：填答頁/預覽外觀
  theme: SurveyThemeSchema.optional(),
  audienceCriteria: AudienceCriteriaSchema.optional(),
  questions: z.array(SurveyQuestionSchema).max(50).optional(),
  // QUA-196: Skip Logic / Conditional Branching rules (uses LogicRuleSchema for full validation)
  logicRules: z.array(LogicRuleSchema).max(200).optional(),
  // QUA-201: Scheduled publish and auto-close（nullish：傳 null 可清除已設定的排程）
  scheduledPublishAt: z.string().datetime().nullish(),
  autoCloseAt: z.string().datetime().nullish(),
  autoCloseAfterN: z.number().int().min(1).max(100000).nullish(),
});

export const CreateSurveySchema = CreateSurveyBaseSchema.superRefine((dto, ctx) => {
  // 標準外部問卷：無站內題目、會進問卷池，必須由建立者填預估分鐘數（mutual 不進池、免填）
  if (dto.type !== 'mutual' && dto.externalUrl && !dto.estimatedMinutes) {
    ctx.addIssue({ code: 'custom', path: ['estimatedMinutes'], message: '外部問卷必須填寫預估填答分鐘數' });
  }
  if (dto.rewardMode !== 'lottery') return;
  if (!dto.lotteryPrize) {
    ctx.addIssue({ code: 'custom', path: ['lotteryPrize'], message: '抽獎回饋必須填寫獎品名稱' });
  }
  if (!dto.lotteryWinnerCount) {
    ctx.addIssue({ code: 'custom', path: ['lotteryWinnerCount'], message: '抽獎回饋必須設定中獎名額' });
  }
  if (!dto.lotteryDrawMode) {
    ctx.addIssue({ code: 'custom', path: ['lotteryDrawMode'], message: '抽獎回饋必須設定開獎方式' });
  }
  if (dto.lotteryDrawMode === 'scheduled' && !dto.lotteryDrawAt) {
    ctx.addIssue({ code: 'custom', path: ['lotteryDrawAt'], message: '指定日期開獎必須設定開獎時間' });
  }
  if (dto.lotteryDrawMode === 'scheduled' && dto.lotteryDrawAt && new Date(dto.lotteryDrawAt).getTime() <= Date.now()) {
    ctx.addIssue({ code: 'custom', path: ['lotteryDrawAt'], message: '指定開獎時間必須晚於目前時間' });
  }
  if (dto.lotteryTermsAccepted !== true) {
    ctx.addIssue({ code: 'custom', path: ['lotteryTermsAccepted'], message: '建立抽獎問卷前必須接受獎品履約條款' });
  }
});

export type CreateSurveyDto = z.infer<typeof CreateSurveySchema>;
export type SurveyQuestionDto = z.infer<typeof SurveyQuestionSchema>;
export type QuestionOptionDto = z.infer<typeof QuestionOptionSchema>;
