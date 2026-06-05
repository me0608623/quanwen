import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
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
import { GoogleFormsImportSchema, GoogleFormsImportDto } from './template-io/google-forms.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletService } from '../wallet/wallet.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateSurveySchema, CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveySchema, UpdateSurveyDto } from './dto/update-survey.dto';
import { AiDraftSchema, AiDraftDto } from './dto/ai-draft.dto';
import { RegenerateQuestionSchema, RegenerateQuestionDto } from './dto/ai-regenerate.dto';
import { PricingAdviceSchema, PricingAdviceDto } from './pricing/pricing-advice.dto';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { z } from 'zod';

const FulfillLotterySchema = z.object({ note: z.string().trim().min(5).max(1000) });
type FulfillLotteryDto = z.infer<typeof FulfillLotterySchema>;

@Controller('surveys')
@UseGuards(JwtAuthGuard)
export class SurveysController {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly surveyLottery: SurveyLotteryService,
    private readonly walletService: WalletService,
    private readonly assistantService: SurveyorAssistantService,
    private readonly pricingService: PricingService,
    private readonly exportService: SurveyExportService,
    private readonly importService: SurveyImportService,
    private readonly excelTemplate: ExcelTemplateService,
    private readonly excelImport: ExcelImportService,
    private readonly googleFormsImport: GoogleFormsImportService,
    private readonly csvImport: CsvImportService,
    private readonly googleSheetsImport: GoogleSheetsImportService,
    private readonly pdfImport: PdfImportService,
    private readonly surveycakeImport: SurveyCakeImportService,
  ) {}

  /** GET /surveys/assistant — surveyor 專屬 AI 助手「下一步建議」*/
  @Get('assistant')
  getAssistant(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.assistantService.recommend(user.id);
  }

  /** GET /surveys/:id/ai-improve — AI 給現有問卷的改進建議 */
  @Get(':id/ai-improve')
  aiImprove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.aiImprove(id, user.id);
  }

  /** GET /surveys/:id/ai-design/anti-cheat — AI 建議插入注意力檢核題（Phase 4）*/
  @Get(':id/ai-design/anti-cheat')
  suggestAntiCheat(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.suggestAttentionChecks(id, user.id);
  }

  /** GET /surveys/:id/ai-design/pre-review — 上架前 AI 預審（Phase 4）*/
  @Get(':id/ai-design/pre-review')
  preReview(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.preReview(id, user.id);
  }

  // ─── POST /surveys ─────────────────────────────────────────────────────────
  @Post()
  create(
    @Req() req: Request,
    @Body(new ZodValidationPipe(CreateSurveySchema)) dto: CreateSurveyDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.create(user.id, dto);
  }

  // ─── GET /surveys ──────────────────────────────────────────────────────────
  @Get()
  findMine(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.findMine(user.id);
  }

  @Get(':id/lottery')
  lotterySummary(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveyLottery.getSummary(id, user.id);
  }

  @Post(':id/lottery/draw')
  @HttpCode(HttpStatus.OK)
  drawLottery(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveyLottery.draw(id, user.id);
  }

  @Post(':id/lottery/fulfill')
  @HttpCode(HttpStatus.OK)
  fulfillLottery(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(FulfillLotterySchema)) dto: FulfillLotteryDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.surveyLottery.fulfill(id, user.id, dto.note);
  }

  @Post(':id/lottery/winners/:resultId/fulfill')
  @HttpCode(HttpStatus.OK)
  fulfillLotteryWinner(
    @Param('id') id: string,
    @Param('resultId') resultId: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(FulfillLotterySchema)) dto: FulfillLotteryDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.surveyLottery.fulfillWinner(id, resultId, user.id, dto.note);
  }

  // ─── GET /surveys/:id ──────────────────────────────────────────────────────
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.findOneDetailed(id, user.id);
  }

  // ─── PATCH /surveys/:id ─────────────────────────────────────────────────────
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: Request,
    @Body(new ZodValidationPipe(UpdateSurveySchema)) dto: UpdateSurveyDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.update(id, user.id, dto);
  }

  // ─── POST /surveys/:id/publish ─────────────────────────────────────────────
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.publish(id, user.id);
  }

  // ─── POST /surveys/:id/duplicate — 複製為新草稿 ────────────────────────────
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  duplicate(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.duplicate(id, user.id);
  }

  // ─── DELETE /surveys/:id ───────────────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.remove(id, user.id);
  }

  // ─── GET /surveys/:id/budget-check ────────────────────────────────────────
  @Get(':id/budget-check')
  budgetCheck(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.walletService.checkSurveyBudget(user.id, id);
  }

  // ─── POST /surveys/ai-draft ────────────────────────────────────────────────
  @Post('ai-draft')
  @HttpCode(HttpStatus.OK)
  aiDraft(
    @Req() req: Request,
    @Body(new ZodValidationPipe(AiDraftSchema)) dto: AiDraftDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.generateAiDraft(dto);
  }

  // ─── POST /surveys/ai-regenerate-question ── Phase II.14：單題重生 ───────────
  @Post('ai-regenerate-question')
  @HttpCode(HttpStatus.OK)
  aiRegenerateQuestion(
    @Req() req: Request,
    @Body(new ZodValidationPipe(RegenerateQuestionSchema)) dto: RegenerateQuestionDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.surveysService.regenerateQuestion(dto);
  }

  // ─── POST /surveys/pricing-advice ── 定價顧問（建議單份獎勵，僅參考）─────────────
  @Post('pricing-advice')
  @HttpCode(HttpStatus.OK)
  pricingAdvice(
    @Body(new ZodValidationPipe(PricingAdviceSchema)) dto: PricingAdviceDto,
  ) {
    return this.pricingService.advise(dto);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 模板匯入 / 匯出(Phase 1)
  // 設計藍圖:13-系統深度設計/問卷匯入匯出設計.md
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /surveys/:id/export.json
   * 匯出問卷模板為 QuanWenSurvey v1 JSON。
   * 非本人問卷 → 403(由 surveysService.findOneDetailed 內擲出)。
   */
  @Get(':id/export.json')
  async exportJson(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as AuthenticatedUser;
    const payload = await this.exportService.exportAsJson(id, user.id);
    const filename = SurveyExportService.safeFilename(payload.survey.title);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return payload;
  }

  /**
   * POST /surveys/import
   * 匯入 v1 JSON,建立新問卷(status=draft);AI 審核要等呼叫 /publish 才會跑。
   * Body 為 raw JSON,由 SurveyImportService 內部用 Zod 驗證,失敗回 422 結構化錯誤。
   */
  @Throttle({ short: { ttl: 1000, limit: 2 }, medium: { ttl: 60_000, limit: 20 } })
  @Post('import')
  @HttpCode(HttpStatus.CREATED)
  async importJson(@Req() req: Request, @Body() body: unknown) {
    const user = req.user as AuthenticatedUser;
    const result = await this.importService.importFromJson(user.id, body);
    return { success: true, data: result };
  }

  /**
   * GET /surveys/template/xlsx
   * 下載空白 Excel 樣板(問卷主填好後再透過 /surveys/import/xlsx 上傳)。
   */
  @Get('template/xlsx')
  async downloadExcelTemplate(@Res({ passthrough: true }) res: Response) {
    const buf = await this.excelTemplate.generate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${ExcelTemplateService.FILENAME}"`);
    return buf;
  }

  /**
   * POST /surveys/import/xlsx
   * 上傳填好的 Excel 樣板 → 解析為 v1 → 走 importer 落 DB(status=draft)。
   * 檔案上限 5MB;multer memory storage。
   */
  @Throttle({ short: { ttl: 1000, limit: 2 }, medium: { ttl: 60_000, limit: 20 } })
  @Post('import/xlsx')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async importXlsx(
    @Req() req: Request,
    // multer 的 File 型別需 @types/multer;這裡只取我們真正用到的欄位,避開額外依賴
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('缺少 file 欄位(multipart/form-data)');
    }
    const user = req.user as AuthenticatedUser;
    const result = await this.excelImport.importFromXlsx(user.id, file.buffer);
    return { success: true, data: result };
  }

  /**
   * POST /surveys/import/google-forms
   * 從 Google Forms viewform 匯入問卷。Body 二擇一:
   *   - { "url": "https://docs.google.com/forms/d/e/<id>/viewform" }
   *   - { "html": "<整份 viewform HTML>" }
   * URL 路徑走 SSRF 防護白名單;HTML 路徑供離線/需登入 forms 的 fallback。
   * 不支援題型(date/time/file_upload 等)會列入 warnings 但不擋整份匯入。
   */
  @Throttle({ short: { ttl: 1000, limit: 2 }, medium: { ttl: 60_000, limit: 20 } })
  @Post('import/google-forms')
  @HttpCode(HttpStatus.CREATED)
  async importGoogleForms(
    @Req() req: Request,
    @Body(new ZodValidationPipe(GoogleFormsImportSchema)) dto: GoogleFormsImportDto,
  ) {
    const user = req.user as AuthenticatedUser;
    const result = await this.googleFormsImport.importFromGoogleForms(user.id, dto);
    return { success: true, data: result };
  }

  // ─── Phase 2: CSV / Google Sheets 匯入 ─────────────────────────────────────

  /**
   * POST /surveys/import/csv
   * 上傳 CSV 檔案（Google Sheets 匯出或手動建立）→ 解析為 v1 → 落 DB。
   * CSV 欄位與 Excel 模板 Questions sheet 同結構。
   */
  @Throttle({ short: { ttl: 1000, limit: 2 }, medium: { ttl: 60_000, limit: 20 } })
  @Post('import/csv')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async importCsv(
    @Req() req: Request,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('缺少 file 欄位 (multipart/form-data)');
    }
    const user = req.user as AuthenticatedUser;
    const result = await this.csvImport.importFromCsv(user.id, file.buffer);
    return { success: true, data: result };
  }

  /**
   * POST /surveys/import/google-sheets
   * 從 Google Sheets 公開連結匯入。Body:
   *   { "url": "https://docs.google.com/spreadsheets/d/{ID}/edit", "gid": "0" }
   * 試算表需設為「知道連結的人都能查看」或「發布到網路」。
   */
  @Throttle({ short: { ttl: 1000, limit: 2 }, medium: { ttl: 60_000, limit: 20 } })
  @Post('import/google-sheets')
  @HttpCode(HttpStatus.CREATED)
  async importGoogleSheets(
    @Req() req: Request,
    @Body() body: { url?: string; gid?: string },
  ) {
    if (!body?.url) {
      throw new BadRequestException('缺少 url 欄位');
    }
    const user = req.user as AuthenticatedUser;
    const result = await this.googleSheetsImport.importFromGoogleSheets(user.id, {
      url: body.url,
      gid: body.gid,
    });
    return { success: true, data: result };
  }

  // ─── Phase 3: PDF / SurveyCake 匯入 ────────────────────────────────────────

  /**
   * POST /surveys/import/pdf
   * 上傳 PDF 檔案 → 解析文字結構 → 產生問卷題目 → 落 DB (status=draft)。
   * 支援表格式、純文字、帶選項符號的問卷 PDF。
   * 掃描圖片式 PDF 無法解析（需含可選取文字）。
   */
  @Throttle({ short: { ttl: 1000, limit: 2 }, medium: { ttl: 60_000, limit: 20 } })
  @Post('import/pdf')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async importPdf(
    @Req() req: Request,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('缺少 file 欄位 (multipart/form-data)');
    }
    const user = req.user as AuthenticatedUser;
    const result = await this.pdfImport.importFromPdf(user.id, file.buffer);
    return { success: true, data: result };
  }

  /**
   * POST /surveys/import/surveycake
   * 從 SurveyCake 匯入問卷。Body 二擇一：
   *   - { "json": { ... } }   — 直接貼上 SurveyCake 匯出的 JSON
   *   - { "url": "https://www.surveycake.com/s/..." } — 從公開連結匯入
   */
  @Throttle({ short: { ttl: 1000, limit: 2 }, medium: { ttl: 60_000, limit: 20 } })
  @Post('import/surveycake')
  @HttpCode(HttpStatus.CREATED)
  async importSurveyCake(
    @Req() req: Request,
    @Body() body: { json?: Record<string, unknown>; url?: string },
  ) {
    if (!body?.json && !body?.url) {
      throw new BadRequestException('必須提供 json 或 url 其中之一');
    }
    if (body.json && body.url) {
      throw new BadRequestException('json 與 url 不可同時提供');
    }
    const user = req.user as AuthenticatedUser;
    const result = body.url
      ? await this.surveycakeImport.importFromUrl(user.id, body.url)
      : await this.surveycakeImport.importFromJson(user.id, body.json);
    return { success: true, data: result };
  }

}
