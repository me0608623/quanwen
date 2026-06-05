/**
 * 回歸測試:防止 GET /surveys/:id/export.json 路由衝突重演。
 *
 * SurveysController(v1 模板匯出)與 ResponsesController(結果資料匯出)
 * 都掛 @Controller('surveys')。兩者曾同時定義 `:id/export.json`,
 * 導致先註冊者遮蔽另一個(模板匯出長期無法觸及)。
 *
 * 本測試斷言兩個 JSON 匯出 handler 的 @Get 路徑彼此不同。
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { PATH_METADATA } from '@nestjs/common/constants';
import { SurveysController } from './surveys.controller';
import { ResponsesController } from '../responses/responses.controller';

const pathOf = (proto: object, method: string): string =>
  Reflect.getMetadata(PATH_METADATA, (proto as Record<string, unknown>)[method] as object) as string;

describe('export.json route collision guard', () => {
  it('模板匯出(SurveysController)路徑為 export.template.json', () => {
    expect(pathOf(SurveysController.prototype, 'exportTemplateJson')).toBe(':id/export.template.json');
  });

  it('結果匯出(ResponsesController)路徑維持 export.json', () => {
    expect(pathOf(ResponsesController.prototype, 'exportJson')).toBe(':id/export.json');
  });

  it('兩個 JSON 匯出 handler 路徑必須相異(否則互相遮蔽)', () => {
    const templatePath = pathOf(SurveysController.prototype, 'exportTemplateJson');
    const resultsPath = pathOf(ResponsesController.prototype, 'exportJson');
    expect(templatePath).not.toBe(resultsPath);
  });
});
