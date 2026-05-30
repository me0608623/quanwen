import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, and } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { createSign, randomBytes, createHash } from 'crypto';
import { DB } from '../db';
import type { AppDb } from '../db';
import { users, oauthAccounts, respondentProfiles, surveyorProfiles } from '../db/schema';
import type { NewUser } from '../db/schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './strategies/jwt.strategy';
import { MailService } from '../mail/mail.service';

const BCRYPT_ROUNDS = 12;

// Short-lived in-memory store for OAuth binding sessions (MVP, non-clustered)
const bindSessions = new Map<string, { userId: string; provider: string; expiresAt: number }>();

function cleanExpiredBindSessions() {
  const now = Date.now();
  for (const [key, val] of bindSessions) {
    if (val.expiresAt < now) bindSessions.delete(key);
  }
}

// Short-lived CSRF state tokens for non-bind LINE/OAuth login flows
// Prevents an attacker from forging a callback with a crafted ?code= parameter
const loginStateSessions = new Map<string, { expiresAt: number }>();

function cleanExpiredLoginStates() {
  const now = Date.now();
  for (const [key, val] of loginStateSessions) {
    if (val.expiresAt < now) loginStateSessions.delete(key);
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  // ─── Get current user (fresh from DB) ─────────────────────────────────────

  async getMe(userId: string) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        status: users.status,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!rows[0]) throw new UnauthorizedException('帳號不存在');
    return rows[0];
  }

  // ─── Email / Password ──────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const inserted = await this.db
        .insert(users)
        .values({ email: dto.email, passwordHash, displayName: dto.displayName, role: dto.role, roleSelectedAt: new Date() } as NewUser)
        .returning({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          status: users.status,
          emailVerified: users.emailVerified,
        });

      const user = inserted[0];
      const token = this.signToken({ sub: user.id, email: user.email, role: user.role });

      // Phase A: 一帳號全功能 — 註冊時同時建立兩種 profile，避免「沒 profile 看不到媒合 / 收益不被計入」
      await this.ensureBothProfiles(user.id);

      // Send verification email non-blocking — registration succeeds even if mail fails
      void this.sendVerificationEmail(user.id);

      return { user: { ...user, avatarUrl: null as string | null }, token };
    } catch (err) {
      // PostgreSQL unique violation code 23505 — email already taken
      if ((err as { code?: string })?.code === '23505') {
        throw new ConflictException('此電子郵件已被使用');
      }
      throw err;
    }
  }

  async login(dto: LoginDto, requestMeta?: { ip?: string; userAgent?: string }) {
    const rows = await this.db.select().from(users).where(eq(users.email, dto.email)).limit(1);
    const user = rows[0];

    // Phase K.5: 把 email 做雜湊再 log，避免 PII 進 log；同時記 IP/UA 給 brute force 監測
    const logLoginFail = (reason: string) => {
      const emailHash = createHash('sha256').update(dto.email.toLowerCase()).digest('hex').slice(0, 12);
      this.logger.warn(
        `Login failed: reason=${reason} emailHash=${emailHash} ip=${requestMeta?.ip ?? 'n/a'} ua=${requestMeta?.userAgent?.slice(0, 60) ?? 'n/a'}`,
      );
    };

    if (!user || !user.passwordHash) {
      logLoginFail('no_user_or_no_password');
      throw new UnauthorizedException('電子郵件或密碼錯誤');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      logLoginFail('wrong_password');
      throw new UnauthorizedException('電子郵件或密碼錯誤');
    }
    if (user.status !== 'active') {
      logLoginFail(`status_${user.status}`);
      throw new UnauthorizedException('帳號已停用，請聯絡客服');
    }

    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
      },
      token,
    };
  }

  // ─── OAuth: Find or Create ─────────────────────────────────────────────────

  async findOrCreateOAuthUser(profile: {
    provider: 'google' | 'line' | 'apple';
    providerAccountId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
    bindToUserId?: string; // set when binding an additional provider to existing account
  }): Promise<{ user: { id: string; email: string; displayName: string; avatarUrl: string | null; role: string; status: string; emailVerified: boolean }; token: string; isNewUser: boolean }> {

    // Normalize email to lowercase for consistent DB lookups
    const email = profile.email.toLowerCase();

    // ── Binding flow: link new provider to existing logged-in user ──
    if (profile.bindToUserId) {
      const existing = await this.db
        .select({ id: oauthAccounts.id, userId: oauthAccounts.userId })
        .from(oauthAccounts)
        .where(
          and(
            eq(oauthAccounts.provider, profile.provider),
            eq(oauthAccounts.providerAccountId, profile.providerAccountId),
          ),
        )
        .limit(1);

      if (existing.length > 0 && existing[0].userId !== profile.bindToUserId) {
        // This provider account is already bound to a different user — reject to prevent takeover
        throw new ConflictException('此第三方帳號已被其他帳號綁定');
      }

      if (existing.length === 0) {
        await this.db.insert(oauthAccounts).values({
          userId: profile.bindToUserId,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          providerEmail: email,
          providerAvatarUrl: profile.avatarUrl,
        });
      }

      const userRows = await this.db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          role: users.role,
          status: users.status,
          emailVerified: users.emailVerified,
        })
        .from(users)
        .where(eq(users.id, profile.bindToUserId))
        .limit(1);

      const user = userRows[0];
      return { user, token: this.signToken({ sub: user.id, email: user.email, role: user.role }), isNewUser: false };
    }

    // ── Normal flow: find by provider account ──
    const existingOAuth = await this.db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, profile.provider),
          eq(oauthAccounts.providerAccountId, profile.providerAccountId),
        ),
      )
      .limit(1);

    if (existingOAuth.length > 0) {
      const userRows = await this.db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          role: users.role,
          status: users.status,
          emailVerified: users.emailVerified,
        })
        .from(users)
        .where(eq(users.id, existingOAuth[0].userId))
        .limit(1);
      const user = userRows[0];
      return { user, token: this.signToken({ sub: user.id, email: user.email, role: user.role }), isNewUser: false };
    }

    // ── New OAuth user: create account ──
    // 安全原則：OAuth 登入「不」自動合併同 email 的既有帳號，
    // 以防止 Google/LINE 用戶意外取得其他帳號（含管理員）的資料與權限。
    // 若用戶希望合併帳號，應先用既有帳號登入，再從「設定 → 連結帳號」綁定。
    let userId: string;
    let isNewUser = false;

    const newUser = await this.db
      .insert(users)
      .values({
        email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        role: 'respondent',       // default; 一帳號全功能, role 欄位僅用於 admin 區分
        emailVerified: !email.endsWith('.placeholder'),
      } as NewUser)
      .returning({ id: users.id })
      .catch(async (err: unknown) => {
        // Only handle PostgreSQL unique violation (23505) — rethrow everything else
        // to avoid masking DB connection errors, constraint name conflicts, etc.
        if ((err as { code?: string })?.code !== '23505') throw err;

        // email 唯一性衝突：此 email 已有帳號但沒有 OAuth 連結
        // 建立一個帶 oauth 後綴的新帳號讓用戶使用，避免覆蓋既有帳號
        const fallbackEmail = `${profile.providerAccountId}+${profile.provider}@oauth.quanwen.local`;
        return this.db
          .insert(users)
          .values({
            email: fallbackEmail,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            role: 'respondent',
            emailVerified: true,
          } as NewUser)
          .returning({ id: users.id });
      });
    userId = newUser[0].id;
    isNewUser = true;

    // Phase A: OAuth 新用戶也補建兩種 profile
    await this.ensureBothProfiles(userId);

    await this.db.insert(oauthAccounts).values({
      userId,
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
      providerEmail: email,
      providerAvatarUrl: profile.avatarUrl,
    });

    const userRows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        status: users.status,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = userRows[0];
    return { user, token: this.signToken({ sub: user.id, email: user.email, role: user.role }), isNewUser };
  }

  // ─── Phase A: 自動建 profile（一帳號全功能必須）──────────────────────────

  async ensureBothProfiles(userId: string): Promise<void> {
    // 兩個 profile 表都對 user_id 做了 UNIQUE，ON CONFLICT DO NOTHING 即可冪等
    await this.db
      .insert(respondentProfiles)
      .values({ userId, isOnboardingDone: false })
      .onConflictDoNothing();
    await this.db
      .insert(surveyorProfiles)
      .values({ userId, isOnboardingDone: false })
      .onConflictDoNothing();
  }

  // ─── Update Display Name ───────────────────────────────────────────────────

  async updateDisplayName(userId: string, displayName: string) {
    await this.db
      .update(users)
      .set({ displayName: displayName.trim(), updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { message: '暱稱已更新' };
  }

  // ─── Security: Change Email ────────────────────────────────────────────────

  async changeEmail(userId: string, newEmail: string) {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, newEmail))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== userId) {
      throw new ConflictException('此電子郵件已被其他帳號使用');
    }

    await this.db
      .update(users)
      .set({ email: newEmail, emailVerified: false, updatedAt: new Date() })
      .where(eq(users.id, userId));

    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        status: users.status,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];
    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });

    // Send verification email to new address non-blocking
    void this.sendVerificationEmail(userId);

    return { user, token, message: '電子郵件已更新，驗證信已發送' };
  }

  // ─── Security: Set / Change Password ──────────────────────────────────────

  async setPassword(userId: string, newPassword: string) {
    const rows = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (rows[0]?.passwordHash) {
      throw new BadRequestException('帳號已有密碼，請使用「更改密碼」功能');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    return { message: '密碼設定成功，現在可以用電子郵件登入' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const rows = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const existing = rows[0];
    if (!existing?.passwordHash) {
      throw new BadRequestException('帳號尚未設定密碼，請使用「設定密碼」功能');
    }

    const valid = await bcrypt.compare(currentPassword, existing.passwordHash);
    if (!valid) throw new UnauthorizedException('目前密碼不正確');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    return { message: '密碼已更新' };
  }

  async hasPassword(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return !!rows[0]?.passwordHash;
  }

  // ─── Linked Providers ─────────────────────────────────────────────────────

  async getLinkedProviders(userId: string) {
    const rows = await this.db
      .select({
        provider: oauthAccounts.provider,
        providerEmail: oauthAccounts.providerEmail,
        providerAvatarUrl: oauthAccounts.providerAvatarUrl,
        createdAt: oauthAccounts.createdAt,
      })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId));

    return rows.map((r) => ({
      provider: r.provider,
      providerEmail: r.providerEmail,
      providerAvatarUrl: r.providerAvatarUrl,
      linkedAt: r.createdAt,
    }));
  }

  async unbindProvider(userId: string, provider: string) {
    // Ensure user has at least one other login method
    const linked = await this.getLinkedProviders(userId);
    const userRows = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const hasPassword = !!userRows[0]?.passwordHash;
    const hasOtherProvider = linked.some((l) => l.provider !== provider);

    if (!hasPassword && !hasOtherProvider) {
      throw new BadRequestException('必須保留至少一種登入方式');
    }

    await this.db
      .delete(oauthAccounts)
      .where(
        and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider as any)),
      );

    return { message: '已解除綁定' };
  }

  // ─── OAuth Binding Session (in-memory, MVP) ────────────────────────────────

  createBindSession(userId: string, provider: string): string {
    cleanExpiredBindSessions();
    // Phase H A07 fix: 用 CSPRNG 取代 Math.random()
    const stateToken = randomBytes(24).toString('hex');
    bindSessions.set(stateToken, { userId, provider, expiresAt: Date.now() + 10 * 60 * 1000 });
    return stateToken;
  }

  resolveBindSession(stateToken: string): { userId: string; provider: string } | null {
    const session = bindSessions.get(stateToken);
    if (!session || session.expiresAt < Date.now()) {
      bindSessions.delete(stateToken);
      return null;
    }
    bindSessions.delete(stateToken);
    return { userId: session.userId, provider: session.provider };
  }

  /** Create a one-time CSRF state token for non-bind OAuth login flows (5 min TTL) */
  createLoginStateToken(): string {
    cleanExpiredLoginStates();
    const token = randomBytes(24).toString('hex');
    loginStateSessions.set(token, { expiresAt: Date.now() + 5 * 60 * 1000 });
    return token;
  }

  /** Validate and consume a CSRF state token. Returns false if invalid or expired. */
  validateAndConsumeLoginState(token: string): boolean {
    const session = loginStateSessions.get(token);
    loginStateSessions.delete(token); // consume regardless (prevent replay)
    return !!session && session.expiresAt > Date.now();
  }

  // ─── LINE OAuth helpers ────────────────────────────────────────────────────

  async exchangeLineCode(code: string): Promise<{ access_token: string; id_token?: string }> {
    const res = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINE_CALLBACK_URL ?? '',
        client_id: process.env.LINE_CHANNEL_ID ?? '',
        client_secret: process.env.LINE_CHANNEL_SECRET ?? '',
      }),
    });

    if (!res.ok) throw new Error(`LINE token exchange failed: ${res.status}`);
    return res.json() as Promise<{ access_token: string; id_token?: string }>;
  }

  async getLineProfile(accessToken: string): Promise<{ userId: string; displayName: string; pictureUrl?: string }> {
    const res = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`LINE profile fetch failed: ${res.status}`);
    return res.json() as Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
  }

  extractEmailFromIdToken(idToken: string): string | null {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
      return payload.email ?? null;
    } catch {
      return null;
    }
  }

  // ─── Apple Sign In helpers ─────────────────────────────────────────────────

  generateAppleClientSecret(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.APPLE_KEY_ID ?? '' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: process.env.APPLE_TEAM_ID ?? '',
      sub: process.env.APPLE_CLIENT_ID ?? '',
      aud: 'https://appleid.apple.com',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');

    const signingInput = `${header}.${payload}`;
    const privateKey = (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

    const sign = createSign('sha256');
    sign.update(signingInput);
    // ES256 requires IEEE P1363 encoding (r||s, not DER)
    const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');
    return `${signingInput}.${signature}`;
  }

  async exchangeAppleCode(code: string): Promise<{ id_token?: string }> {
    const clientSecret = this.generateAppleClientSecret();
    const res = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.APPLE_CALLBACK_URL ?? '',
        client_id: process.env.APPLE_CLIENT_ID ?? '',
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) throw new Error(`Apple token exchange failed: ${res.status}`);
    return res.json() as Promise<{ id_token?: string }>;
  }

  /**
   * Phase K.4: 驗證 Apple id_token 簽章 + iss/aud/exp。
   * 之前的 parseAppleIdToken 只 base64 decode 不驗簽 ⇒ 偽造 id_token 可冒用任何 Apple sub。
   * 改用 jose + Apple JWKS (https://appleid.apple.com/auth/keys) 驗 RS256 簽章。
   */
  async verifyAppleIdToken(idToken: string): Promise<{ sub: string; email?: string } | null> {
    const aud = process.env.APPLE_CLIENT_ID;
    if (!aud) {
      // 沒設 APPLE_CLIENT_ID → 整個 Apple sign-in 都不該啟用，這裡保險回 null
      this.logger.warn('verifyAppleIdToken called but APPLE_CLIENT_ID not configured');
      return null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jose = require('jose');
      const JWKS = jose.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
      const { payload } = await jose.jwtVerify(idToken, JWKS, {
        issuer: 'https://appleid.apple.com',
        audience: aud,
      });
      return {
        sub: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email : undefined,
      };
    } catch (err) {
      this.logger.warn(`Apple id_token verification failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** @deprecated 用 verifyAppleIdToken（會驗簽）取代 */
  parseAppleIdToken(idToken: string): { sub: string; email?: string } | null {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub: string; email?: string };
      return payload;
    } catch {
      return null;
    }
  }

  // ─── Email Verification ────────────────────────────────────────────────────

  async sendVerificationEmail(userId: string): Promise<void> {
    const rows = await this.db
      .select({ id: users.id, email: users.email, displayName: users.displayName, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];
    if (!user) throw new BadRequestException('帳號不存在');
    if (user.emailVerified) return; // Already verified — silently do nothing

    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.db
      .update(users)
      .set({ emailVerificationToken: token, emailVerificationExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    const verifyUrl = `${webUrl}/auth/verify-email?token=${token}`;

    // Fire-and-forget — don't fail the request if email delivery fails
    this.mailService.sendVerificationEmail(user.email, user.displayName, verifyUrl).catch((err) => {
      this.logger.error(`Failed to send verification email for user ${user.id}`, err);
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const rows = await this.db
      .select({
        id: users.id,
        emailVerificationToken: users.emailVerificationToken,
        emailVerificationExpiresAt: users.emailVerificationExpiresAt,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.emailVerificationToken, token))
      .limit(1);

    const user = rows[0];
    if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      throw new BadRequestException('驗證連結已失效或無效，請重新申請');
    }

    await this.db
      .update(users)
      .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  // ─── Password Reset ────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const rows = await this.db
      .select({ id: users.id, displayName: users.displayName, passwordHash: users.passwordHash, status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Always return success to prevent email enumeration.
    // Also skip suspended accounts and accounts without a password (OAuth-only).
    if (rows.length === 0 || !rows[0].passwordHash || rows[0].status !== 'active') return;

    const user = rows[0];
    const token = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.db
      .update(users)
      .set({ passwordResetToken: token, passwordResetExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    const resetUrl = `${webUrl}/auth/reset-password?token=${token}`;

    await this.mailService.sendPasswordResetEmail(email, user.displayName, resetUrl);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const rows = await this.db
      .select({ id: users.id, passwordResetToken: users.passwordResetToken, passwordResetExpiresAt: users.passwordResetExpiresAt })
      .from(users)
      .where(eq(users.passwordResetToken, token))
      .limit(1);

    const user = rows[0];
    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('重設密碼連結已失效或無效，請重新申請');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db
      .update(users)
      .set({ passwordHash, passwordResetToken: null, passwordResetExpiresAt: null, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }

  // Phase P: token refresh — 把 still-valid JWT 換成全新 7d token
  async refreshToken(userId: string): Promise<{ token: string; user: { id: string; email: string; displayName: string; role: string } }> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = rows[0];
    if (!user) throw new UnauthorizedException('User not found');
    if (user.status !== 'active') throw new UnauthorizedException('帳號已停用');

    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });
    this.logger.log(`Token refreshed: userId=${userId}`);
    return {
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private signToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
