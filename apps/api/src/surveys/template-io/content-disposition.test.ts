import { describe, it, expect } from 'vitest';
import { SurveyExportService } from './survey-export.service';

describe('SurveyExportService.contentDisposition', () => {
  it('1. 純 ASCII 檔名:filename 與 filename* 皆正常', () => {
    const v = SurveyExportService.contentDisposition('survey.quanwen.v1.json');
    expect(v).toContain('filename="survey.quanwen.v1.json"');
    expect(v).toContain("filename*=UTF-8''survey.quanwen.v1.json");
  });

  it('2. CJK 檔名:整個 header 值不含任何非 ASCII 位元(否則 setHeader 會丟 ERR_INVALID_CHAR)', () => {
    const v = SurveyExportService.contentDisposition('研究問卷.quanwen.v1.json');
    // 每個 char code 必須 < 128
    expect([...v].every((c) => c.charCodeAt(0) < 128)).toBe(true);
  });

  it('3. CJK 檔名:filename* 用 UTF-8 percent-encoding 保留原名', () => {
    const name = '研究問卷.quanwen.v1.json';
    const v = SurveyExportService.contentDisposition(name);
    expect(v).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
    // ASCII fallback 把 CJK 換成 _
    expect(v).toContain('filename="____.quanwen.v1.json"');
  });

  it('4. 檔名含雙引號:fallback 不破壞 header 結構', () => {
    const v = SurveyExportService.contentDisposition('a"b.json');
    expect(v).toContain('filename="ab.json"');
  });
});
