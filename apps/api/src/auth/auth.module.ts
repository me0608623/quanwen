import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { MailModule } from '../mail/mail.module';

// 只有設了真正的 Google OAuth client id 才註冊 GoogleStrategy。
// passport-google-oauth20 的 Strategy 在 constructor 就要求 clientID，缺了會丟
// "OAuth2Strategy requires a clientID option" → NestJS 建構 provider 失敗 → 整個 API
// 開機崩潰（e2e / 未設 OAuth 的環境會中招）。與 main.ts 的 googleReady 判斷一致。
const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID &&
  !process.env.GOOGLE_CLIENT_ID.startsWith('your_');

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // 缺 Google 設定時不註冊（避免開機崩潰）；/auth/google 路由在未設定時呼叫才會 500
    ...(googleConfigured ? [GoogleStrategy] : []),
  ],
  exports: [AuthService],
})
export class AuthModule {}
