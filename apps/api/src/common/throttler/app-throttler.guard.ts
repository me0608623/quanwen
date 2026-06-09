import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Global throttler guard that enriches the 429 response body with a
 * `retryAfter` field (seconds until the window resets), making it easier
 * for clients to implement back-off logic without parsing headers.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too Many Requests',
        retryAfter: detail.timeToExpire,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
