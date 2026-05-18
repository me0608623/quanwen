import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { db } from '../db';
import { users, oauthAccounts, NewUser } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './strategies/jwt.strategy';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async register(dto: RegisterDto) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (existing) {
      throw new ConflictException('此電子郵件已被使用');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const [user] = await db
      .insert(users)
      .values({
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        role: dto.role,
      } satisfies Partial<NewUser> as NewUser)
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
      });

    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });

    return { user, token };
  }

  async login(dto: LoginDto) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, dto.email))
      .limit(1);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('電子郵件或密碼錯誤');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('電子郵件或密碼錯誤');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('帳號已停用，請聯絡客服');
    }

    const token = this.signToken({ sub: user.id, email: user.email, role: user.role });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
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
    // Check if OAuth account already exists
    const [existingOAuth] = await db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.providerAccountId, profile.providerAccountId))
      .limit(1);

    if (existingOAuth) {
      const [user] = await db
        .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
        .from(users)
        .where(eq(users.id, existingOAuth.userId))
        .limit(1);

      return { user, token: this.signToken({ sub: user.id, email: user.email, role: user.role }) };
    }

    // Check if user with this email already exists
    let userId: string;
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, profile.email))
      .limit(1);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const [newUser] = await db
        .insert(users)
        .values({
          email: profile.email,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          role: 'respondent', // Google OAuth 預設為受試者
          emailVerified: true,
        })
        .returning({ id: users.id });

      userId = newUser.id;
    }

    await db.insert(oauthAccounts).values({
      userId,
      provider: profile.provider,
      providerAccountId: profile.providerAccountId,
    });

    const [user] = await db
      .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return { user, token: this.signToken({ sub: user.id, email: user.email, role: user.role }) };
  }

  private signToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
