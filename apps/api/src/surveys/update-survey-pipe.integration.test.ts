/**
 * Integration tests for issue #137 — ZodValidationPipe default injection bug.
 *
 * Root cause: UpdateSurveySchema = CreateSurveyBaseSchema.partial() kept .default()
 * on 5 fields (type/aiReviewEnabled/rewardPoints/targetCount/isAnonymous).
 * ZodValidationPipe injected those defaults even when the client didn't send them,
 * making updatePublishedInfo's `!== undefined` check block every published PATCH.
 *
 * Two layers of coverage:
 *   1. Schema parse (pure Zod) — ZodValidationPipe behaviour without NestJS overhead
 *   2. HTTP pipeline (supertest) — PATCH through the real controller + ZodValidationPipe
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, type ExecutionContext } from '@nestjs/common';
import supertest from 'supertest';

import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UpdateSurveySchema } from './dto/update-survey.dto';
import { CreateSurveySchema } from './dto/create-survey.dto';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';
import { SurveyLotteryService } from './survey-lottery.service';
import { SurveyorAssistantService } from './surveyor-assistant.service';
import { PricingService } from './pricing/pricing.service';
import { SurveyExportService } from './template-io/survey-export.service';
import { SurveyImportService } from './template-io/survey-import.service';
import { ExcelTemplateService } from './template-io/excel-template.service';
import { ExcelImportService } from './template-io/excel-import.service';
import { GoogleFormsImportService } from './template-io/google-forms.service';
import { CsvImportService } from './template-io/csv-import.service';
import { GoogleSheetsImportService } from './template-io/google-sheets-import.service';
import { PdfImportService } from './template-io/pdf-import.service';
import { SurveyCakeImportService } from './template-io/surveycake-import.service';
import { WalletService } from '../wallet/wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// ─── 1. Pure schema tests ─────────────────────────────────────────────────────

describe('UpdateSurveySchema — no default injection', () => {
  const pipe = new ZodValidationPipe(UpdateSurveySchema);

  it('PATCH {title, theme} does not inject type/aiReviewEnabled/rewardPoints/targetCount/isAnonymous', () => {
    const result = pipe.transform({ title: '新標題', theme: { accentColor: '#2563eb' } }) as Record<string, unknown>;
    expect(result).toEqual({ title: '新標題', theme: { accentColor: '#2563eb' } });
    expect(result['type']).toBeUndefined();
    expect(result['aiReviewEnabled']).toBeUndefined();
    expect(result['rewardPoints']).toBeUndefined();
    expect(result['targetCount']).toBeUndefined();
    expect(result['isAnonymous']).toBeUndefined();
  });

  it('PATCH {} (empty body) parses to empty object — no defaults', () => {
    const result = pipe.transform({}) as Record<string, unknown>;
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('PATCH {theme} alone keeps only theme — no other defaults', () => {
    const result = pipe.transform({ theme: { backgroundColor: '#ffffff' } }) as Record<string, unknown>;
    expect(result).toEqual({ theme: { backgroundColor: '#ffffff' } });
    expect(result['type']).toBeUndefined();
    expect(result['rewardPoints']).toBeUndefined();
  });
});

describe('CreateSurveySchema — defaults still injected on create', () => {
  const pipe = new ZodValidationPipe(CreateSurveySchema);

  it('CREATE with only title + questions still gets type/aiReviewEnabled/rewardPoints/targetCount/isAnonymous defaults', () => {
    const result = pipe.transform({
      title: 'Test',
      questions: [{ type: 'text', title: 'Q1' }],
    }) as Record<string, unknown>;
    expect(result['type']).toBe('standard');
    expect(result['aiReviewEnabled']).toBe(true);
    expect(result['rewardPoints']).toBe(0);
    expect(result['targetCount']).toBe(100);
    expect(result['isAnonymous']).toBe(true);
  });
});

// ─── 2. HTTP pipeline test ────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-111', email: 'test@quanwen.com', role: 'surveyor' };

class MockJwtGuard {
  canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getRequest<{ user: unknown }>().user = MOCK_USER;
    return true;
  }
}

describe('PATCH /surveys/:id — ZodValidationPipe does not inject defaults into service.update()', () => {
  let app: INestApplication;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    updateSpy = vi.fn().mockResolvedValue({ id: 'survey-aaa', title: '新標題' });

    const mockSurveysService = { update: updateSpy };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SurveysController],
      providers: [
        { provide: SurveysService, useValue: mockSurveysService },
        { provide: SurveyLotteryService, useValue: {} },
        { provide: WalletService, useValue: {} },
        { provide: SurveyorAssistantService, useValue: {} },
        { provide: PricingService, useValue: {} },
        { provide: SurveyExportService, useValue: {} },
        { provide: SurveyImportService, useValue: {} },
        { provide: ExcelTemplateService, useValue: {} },
        { provide: ExcelImportService, useValue: {} },
        { provide: GoogleFormsImportService, useValue: {} },
        { provide: CsvImportService, useValue: {} },
        { provide: GoogleSheetsImportService, useValue: {} },
        { provide: PdfImportService, useValue: {} },
        { provide: SurveyCakeImportService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(MockJwtGuard)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('PATCH with only {title, theme} — service.update receives dto without default fields', async () => {
    await supertest(app.getHttpServer())
      .patch('/surveys/survey-aaa')
      .send({ title: '新標題', theme: { accentColor: '#2563eb', backgroundColor: '#eff6ff' } })
      .expect(200);

    expect(updateSpy).toHaveBeenCalledOnce();
    const [, , dto] = updateSpy.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
    expect(dto['title']).toBe('新標題');
    expect(dto['theme']).toEqual({ accentColor: '#2563eb', backgroundColor: '#eff6ff' });
    // The 5 formerly-defaulted fields must NOT appear in dto
    expect(dto['type']).toBeUndefined();
    expect(dto['aiReviewEnabled']).toBeUndefined();
    expect(dto['rewardPoints']).toBeUndefined();
    expect(dto['targetCount']).toBeUndefined();
    expect(dto['isAnonymous']).toBeUndefined();
  });

  it('PATCH with empty body — service.update receives empty dto', async () => {
    await supertest(app.getHttpServer())
      .patch('/surveys/survey-bbb')
      .send({})
      .expect(200);

    const [, , dto] = updateSpy.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
    expect(Object.keys(dto)).toHaveLength(0);
  });
});
