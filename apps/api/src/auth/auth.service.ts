import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DB } from '../db';
import type { AppDb } from '../db';
import { users, oauthAccounts } from '../db/schema';
import type { NewUser } from '../db/schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './strategies/jwt.strategy';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('此電子郵件已被使用');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const inserted = await this.db
      .insert(users)
      .values({
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role: dto.role,
      } as NewUser)
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
      });

    const user = inserted[0];
    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });
    return { user, token };
  }

  async login(dto: LoginDto) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    const user = rows[0];

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('電子郵件或密碼錯誤');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('電子郵件或密碼錯誤');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('帳號已停用，請聯絡客服');
    }

    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      token,
    };
  }

  async findOrCreateOAuthUser(profile: {
    provider: 'google';
    providerAccountId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  }) {
    const existingOAuth = await this.db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerAccountId, profile.providerAccountId))
      .limit(1);

    if (existingOAuth.length > 0) {
      const rows = await this.db
        .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
        .from(users)
        .where(eq(users.id, existingOAuth[0].userId))
        .limit(1);
      const user = rows[0];
      return { user, token: this.signToken({ sub: user.id, email: user.email, role: user.role }) };
    }

    let userId: string;
    const existingUser = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    if (existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      const newUser = await this.db
        .insert(users)
        .values({ email: profile.email, displayName: profile.displayName, avatarUrl: profile.avatarUrl, role: 'respondent', emailVerified: true } as NewUser)
        .returning({ id: users.id });
      userId = newUser[0].id;
    }

    await this.db.insert(oauthAccounts).values({ userId, provider: profile.provider, providerAccountId: profile.providerAccountId });

    const rows = await this.db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const user = rows[0];
    return { user, token: this.signToken({ sub: user.id, email: user.email, role: user.role }) };
  }

  private signToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
