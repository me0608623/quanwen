import { z } from 'zod';

/**
 * Phase 2:Google Forms 匯入 request body。
 *
 * 必須提供 url 或 html 其中之一,不可同時提供(service 內二次檢查)。
 */
export const GoogleFormsImportSchema = z
  .object({
    url: z.string().url().max(2000).refine(u => /^https:\/\//i.test(u), { message: 'Google Forms URL 必須使用 https' }).optional(),
    html: z.string().min(50).max(5 * 1024 * 1024).optional(),
  })
  .refine((d) => Boolean(d.url) !== Boolean(d.html), {
    message: '必須提供 url 或 html 其中之一(不可同時)',
  });

export type GoogleFormsImportDto = z.infer<typeof GoogleFormsImportSchema>;
