import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { GoogleSheetsImportService } from './google-sheets-import.service';
import type { CsvImportService } from './csv-import.service';

describe('GoogleSheetsImportService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('會把 Google Sheets edit URL 轉成 csv export URL 再交給 CsvImportService', async () => {
    const csvImport = {
      importFromCsv: vi.fn().mockResolvedValue({
        id: 'sheet-survey-id',
        status: 'draft',
        questionsCount: 1,
        warnings: [],
      }),
    } as unknown as CsvImportService;

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Uint8Array.from(Buffer.from('sortOrder,type,title\n0,text,Q1')).buffer,
    });
    vi.stubGlobal('fetch', fetchMock);

    const svc = new GoogleSheetsImportService(csvImport);
    const result = await svc.importFromGoogleSheets('user-1', {
      url: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=456',
    });

    expect(result.id).toBe('sheet-survey-id');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://docs.google.com/spreadsheets/d/abc123/export?format=csv&gid=456',
    );
    expect((csvImport.importFromCsv as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('user-1');
  });

  it('收到 HTML 而不是 CSV 時會丟 BadRequest', async () => {
    const csvImport = {
      importFromCsv: vi.fn(),
    } as unknown as CsvImportService;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => Uint8Array.from(Buffer.from('<html>login required</html>')).buffer,
    }));

    const svc = new GoogleSheetsImportService(csvImport);

    await expect(
      svc.importFromGoogleSheets('user-1', {
        url: 'https://docs.google.com/spreadsheets/d/abc123/edit',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
