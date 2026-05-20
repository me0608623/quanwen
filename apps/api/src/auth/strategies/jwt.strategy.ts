import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { eq } from 'drizzle-orm';
import { DB } from '../../db';
import type { AppDb } from '../../db';
import { users } from '../../db/schema';

/** Shape of the signed JWT token payload */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

/** Shape of req.user after JwtStrategy.validate() runs */
export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'surveyor' | 'respondent' | 'admin';
  status: 'active' | 'suspended' | 'pending_verify';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(DB) private readonly db: AppDb) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload) {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    const user = rows[0];
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('帳號不存在或已停用');
    }
    return user;
  }
}
