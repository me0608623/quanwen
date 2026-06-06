import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type RequestWithContext = Request & { requestId?: string };

/**
 * 從例外（含 drizzle 包裝的 cause 鏈）取出 Postgres error code。
 * drizzle 會把原始 pg error 包成 `Failed query: ...` 並掛在 cause 上，逐層往下找。
 */
function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message =
      exception instanceof HttpException
        ? exception.getResponse()
        : '伺服器發生錯誤，請稍後再試';

    // Postgres 22P02 = invalid_text_representation（如把非 UUID / 非整數字串丟進對應欄位查詢）。
    // 在 API 邊界幾乎都是 path/query 參數格式錯誤 → 回 400 而非 500，避免噴整段 SQL 到 log。
    if (!(exception instanceof HttpException) && pgErrorCode(exception) === '22P02') {
      status = HttpStatus.BAD_REQUEST;
      message = '參數格式不正確';
    }

    if (status >= 500) {
      this.logger.error(
        JSON.stringify({
          level: 'error',
          msg: 'http_exception',
          requestId: request.requestId ?? null,
          method: request.method,
          path: request.url,
          statusCode: status,
          error: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(typeof message === 'object' ? message : { message }),
    });
  }
}
