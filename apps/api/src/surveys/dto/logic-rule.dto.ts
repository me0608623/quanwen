import { z } from 'zod';

// ─── Logic Rule Schema (QUA-196: Skip Logic / Conditional Branching) ─────────

export const LogicConditionEnum = z.enum([
  'eq',           // 等於
  'neq',          // 不等於
  'gt',           // 大於
  'gte',          // 大於等於
  'lt',           // 小於
  'lte',          // 小於等於
  'contains',     // 包含
  'not_contains', // 不包含
  'is_empty',     // 未作答
  'is_not_empty', // 已作答
]);

export const LogicActionEnum = z.enum(['show', 'hide', 'skip']);

export const LogicRuleSchema = z.object({
  triggerQuestionId: z.string().uuid(),
  condition: LogicConditionEnum,
  // 比對值。is_empty / is_not_empty 可省略；其餘條件必填
  value: z.string().max(2000).optional(),
  action: LogicActionEnum.default('show'),
  targetQuestionId: z.string().uuid(),
  sortOrder: z.number().int().min(0).default(0),
}).refine(
  (data) => {
    // is_empty / is_not_empty 不需要 value
    if (data.condition === 'is_empty' || data.condition === 'is_not_empty') {
      return true;
    }
    // 其他條件必須有 value
    return typeof data.value === 'string' && data.value.length > 0;
  },
  { message: '此條件類型必須提供 value', path: ['value'] },
).refine(
  (data) => data.triggerQuestionId !== data.targetQuestionId,
  { message: '觸發題目與目標題目不可相同', path: ['targetQuestionId'] },
);

export type LogicRuleDto = z.infer<typeof LogicRuleSchema>;
