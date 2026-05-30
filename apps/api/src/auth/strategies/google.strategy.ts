import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import type { Request } from 'express';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('Google 帳號未提供電子郵件'), undefined);
    }

    // Check if this is a bind flow (state starts with "bind:")
    const state = (req.query?.state ?? '') as string;
    let bindToUserId: string | undefined;
    let isBind = false;

    if (state.startsWith('bind:')) {
      const bindSession = this.authService.resolveBindSession(state.slice(5));
      if (!bindSession) {
        // Bind session expired — pass a flag so the callback can redirect with an error
        return done(null, { bindExpired: true });
      }
      bindToUserId = bindSession.userId;
      isBind = true;
    }

    try {
      const result = await this.authService.findOrCreateOAuthUser({
        provider: 'google',
        providerAccountId: profile.id,
        email,
        displayName: profile.displayName,
        avatarUrl: profile.photos?.[0]?.value,
        bindToUserId,
      });
      done(null, { ...result, isBind });
    } catch (err) {
      // Pass error flag so controller can redirect instead of Passport throwing 401
      done(null, { bindError: (err as Error).message ?? 'bind_failed', isBind });
    }
  }
}
