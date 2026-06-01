import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UsePipes,
  UseGuards,
  Req,
  Res,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import { RegisterSchema, RegisterDto } from './dto/register.dto';
import { LoginSchema, LoginDto } from './dto/login.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

/** Phase H A07 fix: 用 CSPRNG 取代 Math.random() 產生 OAuth state / nonce */
function secureRandomToken(bytes = 16): string {
  return randomBytes(bytes).toString('hex');
}

interface OAuthCallbackResult {
  user: unknown;
  token: string;
  isNewUser: boolean;
  isBind?: boolean;
  bindExpired?: boolean;
  bindError?: string;
}

const WEB_URL = () => process.env.WEB_URL ?? 'http://localhost:3000';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  private validatePasswordPolicy(password: string, label = '密碼') {
    if (!password || password.length < 8) throw new BadRequestException(`${label}至少 8 個字元`);
    if (password.length > 72) throw new BadRequestException(`${label}最多 72 個字元`);
    if (!/[A-Z]/.test(password)) throw new BadRequestException(`${label}需包含至少一個大寫字母`);
    if (!/[0-9]/.test(password)) throw new BadRequestException(`${label}需包含至少一個數字`);
  }

  // ─── Email / Password ──────────────────────────────────────────────────────

  @Post('register')
  @Throttle({ medium: { ttl: 60_000, limit: 5 } })
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 10 } })
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    // Phase K.5: 把 IP / UA 帶進 service 用於 brute-force 監測 log
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || undefined;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(dto, { ip, userAgent });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.authService.getMe(user.id);
  }

  /**
   * Phase P: token refresh.
   * 用 still-valid Bearer token 換一份新的 7d token，
   * 讓長期在線的用戶不必每 7d 重新登入。
   * 之後可進一步把 access 縮短 + 接 refresh token table (with revocation)。
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ medium: { ttl: 60_000, limit: 30 } })
  async refresh(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.authService.refreshToken(user.id);
  }

  // ─── Email Verification ────────────────────────────────────────────────────

  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ medium: { ttl: 60_000, limit: 3 } })
  async sendVerificationEmail(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    await this.authService.sendVerificationEmail(user.id);
    return { message: '驗證信已發送，請在 24 小時內點擊連結完成驗證' };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 10 } })
  async verifyEmail(@Body() body: { token: string }) {
    if (!body.token) throw new BadRequestException('缺少驗證 token');
    await this.authService.verifyEmail(body.token);
    return { message: '電子郵件驗證成功' };
  }

  // ─── Password Reset ────────────────────────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 3 } })
  async forgotPassword(@Body() body: { email: string }) {
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      throw new BadRequestException('請輸入有效的電子郵件');
    }
    // Always returns 200 to prevent email enumeration
    await this.authService.forgotPassword(body.email.toLowerCase().trim());
    return { message: '若該電子郵件存在，我們已寄出重設密碼信' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ medium: { ttl: 60_000, limit: 5 } })
  async resetPassword(@Body() body: { token: string; password: string }) {
    if (!body.token) throw new BadRequestException('缺少重設 token');
    this.validatePasswordPolicy(body.password);
    await this.authService.resetPassword(body.token, body.password);
    return { message: '密碼已重設，請使用新密碼登入' };
  }

  // ─── Security ─────────────────────────────────────────────────────────────

  @Get('security')
  @UseGuards(JwtAuthGuard)
  async securityInfo(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const hasPassword = await this.authService.hasPassword(user.id);
    const linked = await this.authService.getLinkedProviders(user.id);
    return { hasPassword, linkedProviders: linked };
  }

  @Post('security/change-email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changeEmail(@Body() body: { email: string }, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      throw new BadRequestException('請輸入有效的電子郵件');
    }
    return this.authService.changeEmail(user.id, body.email.toLowerCase().trim());
  }

  @Post('security/set-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async setPassword(@Body() body: { password: string }, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.validatePasswordPolicy(body.password);
    return this.authService.setPassword(user.id, body.password);
  }

  @Post('security/change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(@Body() body: { currentPassword: string; newPassword: string }, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    this.validatePasswordPolicy(body.newPassword, '新密碼');
    return this.authService.changePassword(user.id, body.currentPassword, body.newPassword);
  }

  // ─── Update Display Name ───────────────────────────────────────────────────

  @Post('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateProfile(@Body() body: { displayName?: string }, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    if (body.displayName) {
      const trimmed = body.displayName.trim();
      if (trimmed.length < 1 || trimmed.length > 100) {
        throw new BadRequestException('暱稱長度需在 1–100 個字元');
      }
      return this.authService.updateDisplayName(user.id, trimmed);
    }
    return { message: 'no changes' };
  }

  // ─── Linked Providers ─────────────────────────────────────────────────────

  @Get('linked-providers')
  @UseGuards(JwtAuthGuard)
  async linkedProviders(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.authService.getLinkedProviders(user.id);
  }

  @Delete('linked-providers/:provider')
  @UseGuards(JwtAuthGuard)
  async unbindProvider(@Param('provider') provider: string, @Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.authService.unbindProvider(user.id, provider);
  }

  // ─── Google OAuth ──────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport handles redirect to Google
  }

  @Get('bind/google')
  @UseGuards(JwtAuthGuard)
  bindGoogle(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const stateToken = this.authService.createBindSession(user.id, 'google');
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: process.env.GOOGLE_CALLBACK_URL ?? '',
      response_type: 'code',
      scope: 'email profile',
      state: `bind:${stateToken}`,
      access_type: 'offline',
      prompt: 'select_account',
    });
    return { redirectUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const result = req.user as OAuthCallbackResult;
    if (result.bindExpired) {
      return res.redirect(`${WEB_URL()}/settings/accounts?error=bind_expired`);
    }
    if (result.bindError) {
      return res.redirect(`${WEB_URL()}/settings/accounts?error=already_bound`);
    }
    if (result.isBind) {
      return res.redirect(`${WEB_URL()}/settings/accounts?bound=google`);
    }
    // 不論新舊用戶，OAuth 成功一律走 /auth/callback 設 token + 進 /dashboard
    return res.redirect(`${WEB_URL()}/auth/callback?token=${result.token}`);
  }

  // ─── LINE OAuth ────────────────────────────────────────────────────────────

  @Get('line')
  lineAuth(@Query('bind') bind: string | undefined, @Res() res: Response) {
    // For non-bind flows, use a server-tracked CSRF state token (5 min TTL)
    // instead of a random token that is never validated on callback.
    const state = bind ? `bind:${bind}` : `login:${this.authService.createLoginStateToken()}`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINE_CHANNEL_ID ?? '',
      redirect_uri: process.env.LINE_CALLBACK_URL ?? '',
      scope: 'profile openid email',
      state,
      nonce: secureRandomToken(),
    });
    return res.redirect(`https://access.line.me/oauth2/v2.1/authorize?${params}`);
  }

  @Get('bind/line')
  @UseGuards(JwtAuthGuard)
  bindLine(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const stateToken = this.authService.createBindSession(user.id, 'line');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINE_CHANNEL_ID ?? '',
      redirect_uri: process.env.LINE_CALLBACK_URL ?? '',
      scope: 'profile openid email',
      state: `bind:${stateToken}`,
      nonce: secureRandomToken(),
    });
    return { redirectUrl: `https://access.line.me/oauth2/v2.1/authorize?${params}` };
  }

  @Get('line/callback')
  async lineCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error || !code) {
      return res.redirect(`${WEB_URL()}/auth/login?error=cancelled`);
    }

    try {
      const isBindAttempt = state?.startsWith('bind:');
      const isLoginAttempt = state?.startsWith('login:');

      // Validate CSRF state token for both bind and normal login flows
      if (isBindAttempt) {
        const bindSession = this.authService.resolveBindSession(state!.slice(5));
        if (!bindSession) {
          return res.redirect(`${WEB_URL()}/settings/accounts?error=bind_expired`);
        }
        // Re-assign for the code below (TypeScript narrowing)
        const resolvedBind = bindSession;

        const tokenData = await this.authService.exchangeLineCode(code);
        const profile = await this.authService.getLineProfile(tokenData.access_token);
        const email = tokenData.id_token
          ? this.authService.extractEmailFromIdToken(tokenData.id_token) ?? `line_${profile.userId}@line.placeholder`
          : `line_${profile.userId}@line.placeholder`;
        await this.authService.findOrCreateOAuthUser({
          provider: 'line',
          providerAccountId: profile.userId,
          email,
          displayName: profile.displayName,
          avatarUrl: profile.pictureUrl,
          bindToUserId: resolvedBind.userId,
        });
        return res.redirect(`${WEB_URL()}/settings/accounts?bound=line`);
      }

      // Validate CSRF state for normal login flow
      if (isLoginAttempt) {
        const valid = this.authService.validateAndConsumeLoginState(state!.slice(6));
        if (!valid) {
          return res.redirect(`${WEB_URL()}/auth/login?error=oauth_failed`);
        }
      }
      // Legacy: state from old clients without login: prefix — allow through but log
      if (!isLoginAttempt) {
        this.logger.warn('LINE callback: unrecognized state prefix, allowing for backward compat');
      }

      // Normal login flow — exchange code and create/find user
      const tokenData = await this.authService.exchangeLineCode(code);
      const profile = await this.authService.getLineProfile(tokenData.access_token);
      const email = tokenData.id_token
        ? this.authService.extractEmailFromIdToken(tokenData.id_token) ?? `line_${profile.userId}@line.placeholder`
        : `line_${profile.userId}@line.placeholder`;

      const result = await this.authService.findOrCreateOAuthUser({
        provider: 'line',
        providerAccountId: profile.userId,
        email,
        displayName: profile.displayName,
        avatarUrl: profile.pictureUrl,
      });

      // 不論新舊用戶，OAuth 成功一律走 /auth/callback 設 token + 進 /dashboard
      return res.redirect(`${WEB_URL()}/auth/callback?token=${result.token}`);
    } catch (err) {
      this.logger.error('LINE callback error', err);
      if (err instanceof ConflictException) {
        return res.redirect(`${WEB_URL()}/settings/accounts?error=already_bound`);
      }
      return res.redirect(`${WEB_URL()}/auth/login?error=oauth_failed`);
    }
  }

  // ─── Apple Sign In ─────────────────────────────────────────────────────────

  @Get('apple')
  appleAuth(@Res() res: Response) {
    // Use server-tracked state token (same CSRF pattern as LINE login)
    const state = `login:${this.authService.createLoginStateToken()}`;
    const params = new URLSearchParams({
      response_type: 'code id_token',
      response_mode: 'form_post',
      client_id: process.env.APPLE_CLIENT_ID ?? '',
      redirect_uri: process.env.APPLE_CALLBACK_URL ?? '',
      scope: 'name email',
      state,
    });
    return res.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
  }

  @Get('bind/apple')
  @UseGuards(JwtAuthGuard)
  bindApple(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    const stateToken = this.authService.createBindSession(user.id, 'apple');
    const params = new URLSearchParams({
      response_type: 'code id_token',
      response_mode: 'form_post',
      client_id: process.env.APPLE_CLIENT_ID ?? '',
      redirect_uri: process.env.APPLE_CALLBACK_URL ?? '',
      scope: 'name email',
      state: `bind:${stateToken}`,
    });
    return { redirectUrl: `https://appleid.apple.com/auth/authorize?${params}` };
  }

  // Apple sends POST to callback (form_post response mode)
  @Post('apple/callback')
  @HttpCode(HttpStatus.FOUND)
  async appleCallback(
    @Body() body: { code?: string; id_token?: string; state?: string; error?: string; user?: string },
    @Res() res: Response,
  ) {
    if (body.error || !body.code) {
      return res.redirect(`${WEB_URL()}/auth/login?error=cancelled`);
    }

    try {
      const isBindAttempt = body.state?.startsWith('bind:');
      const isLoginAttempt = body.state?.startsWith('login:');

      const bindSession = isBindAttempt
        ? this.authService.resolveBindSession(body.state!.slice(5))
        : null;

      if (isBindAttempt && !bindSession) {
        return res.redirect(`${WEB_URL()}/settings/accounts?error=bind_expired`);
      }

      // Validate CSRF state for normal login flow (same pattern as LINE)
      if (isLoginAttempt) {
        const valid = this.authService.validateAndConsumeLoginState(body.state!.slice(6));
        if (!valid) {
          return res.redirect(`${WEB_URL()}/auth/login?error=oauth_failed`);
        }
      } else if (!isBindAttempt) {
        this.logger.warn('Apple callback: unrecognized state prefix, rejecting for security');
        return res.redirect(`${WEB_URL()}/auth/login?error=oauth_failed`);
      }

      // Exchange code for id_token (validates server-side)
      const tokenData = await this.authService.exchangeAppleCode(body.code);
      const idToken = tokenData.id_token ?? body.id_token;
      if (!idToken) throw new Error('no id_token from Apple');

      // Phase K.4: 用 verifyAppleIdToken 驗 RS256 簽章 + iss/aud/exp（不再只 base64 decode）
      const appleUser = await this.authService.verifyAppleIdToken(idToken);
      if (!appleUser) throw new Error('invalid Apple id_token (signature/iss/aud verification failed)');

      // Apple only sends user name on first authorization
      let displayName = 'Apple User';
      if (body.user) {
        try {
          const parsed = JSON.parse(body.user) as { name?: { firstName?: string; lastName?: string } };
          const { firstName = '', lastName = '' } = parsed.name ?? {};
          displayName = `${firstName} ${lastName}`.trim() || displayName;
        } catch { /* ignore */ }
      }

      const email = appleUser.email ?? `apple_${appleUser.sub}@apple.placeholder`;

      const result = await this.authService.findOrCreateOAuthUser({
        provider: 'apple',
        providerAccountId: appleUser.sub,
        email,
        displayName,
        bindToUserId: bindSession?.userId,
      });

      if (bindSession) {
        return res.redirect(`${WEB_URL()}/settings/accounts?bound=apple`);
      }
      // 不論新舊用戶，OAuth 成功一律走 /auth/callback 設 token + 進 /dashboard
      return res.redirect(`${WEB_URL()}/auth/callback?token=${result.token}`);
    } catch (err) {
      this.logger.error('Apple callback error', err);
      if (err instanceof ConflictException) {
        return res.redirect(`${WEB_URL()}/settings/accounts?error=already_bound`);
      }
      return res.redirect(`${WEB_URL()}/auth/login?error=oauth_failed`);
    }
  }
}
