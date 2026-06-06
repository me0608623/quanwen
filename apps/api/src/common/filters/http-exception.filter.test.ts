import { describe, it, expect, vi } from 'vitest';
import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { GlobalExceptionFilter } from './http-exception.filter';

/** 造一個最小 ArgumentsHost，回傳 mock res 以斷言 status/json */
function makeHost() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status };
  const req = { requestId: 'req-1', method: 'GET', url: '/api/v1/tasks/garbage' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('drizzle 包裝的 Postgres 22P02（非 UUID 參數）→ 400 + 乾淨訊息', () => {
    const { host, status, json } = makeHost();
    // 模擬 drizzle：外層 Error("Failed query")，原始 pg error 掛在 cause 上
    const pgErr = Object.assign(new Error('invalid input syntax for type uuid: "garbage"'), { code: '22P02' });
    const wrapped = Object.assign(new Error('Failed query: select ...'), { cause: pgErr });

    filter.catch(wrapped, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: '參數格式不正確' }));
  });

  it('直接帶 code 的 22P02 也能辨識', () => {
    const { host, status } = makeHost();
    const err = Object.assign(new Error('invalid input syntax for type integer'), { code: '22P02' });
    filter.catch(err, host);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('一般未知錯誤 → 500', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
  });

  it('HttpException 維持原本 status（NotFound=404）', () => {
    const { host, status } = makeHost();
    filter.catch(new NotFoundException('問卷不存在'), host);
    expect(status).toHaveBeenCalledWith(404);
  });

  it('HttpException 維持原本 status（BadRequest=400）', () => {
    const { host, status } = makeHost();
    filter.catch(new BadRequestException('bad'), host);
    expect(status).toHaveBeenCalledWith(400);
  });
});
