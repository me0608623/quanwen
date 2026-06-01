import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { MailModule } from '../mail/mail.module';

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
    // GoogleStrategy 永遠註冊。strategy constructor 在 NestFactory.create() 裡執行，
    // 此時 dotenv.config() 已完成，process.env 有正確的值。
    // 模組層級的 googleConfigured 檢查因 CommonJS import hoisting 會在 dotenv 前執行，
    // 造成 credentials 存在時仍回傳 500，故移除。
    GoogleStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
