import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { vi } from 'vitest';

describe('MailService', () => {
  let service: MailService;
  let sendMailMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService],
    }).compile();

    service = module.get<MailService>(MailService);
    // Replace the real transporter's sendMail with our mock
    (service as any).transporter = { sendMail: sendMailMock };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email with correct subject', async () => {
      await service.sendVerificationEmail('test@example.com', 'Test User', 'https://example.com/verify?token=abc');

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const call = sendMailMock.mock.calls[0][0];
      expect(call.to).toBe('test@example.com');
      expect(call.subject).toContain('驗證');
      expect(call.html).toContain('Test User');
      expect(call.html).toContain('https://example.com/verify?token=abc');
    });

    it('should throw on SMTP error', async () => {
      sendMailMock.mockRejectedValue(new Error('SMTP down'));
      await expect(
        service.sendVerificationEmail('x@y.com', 'U', 'https://v'),
      ).rejects.toThrow('SMTP down');
    });
  });

  describe('sendNotificationEmail', () => {
    it('should skip sending when SMTP_HOST is not set', async () => {
      delete process.env.SMTP_HOST;
      await service.sendNotificationEmail('a@b.com', 'User', 'Title', 'Body');
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should send when SMTP is configured', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      try {
        await service.sendNotificationEmail('a@b.com', 'User', 'Alert', 'Something happened');
        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const call = sendMailMock.mock.calls[0][0];
        expect(call.to).toBe('a@b.com');
        expect(call.subject).toContain('Alert');
      } finally {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
      }
    });

    it('should swallow SMTP errors gracefully', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      sendMailMock.mockRejectedValue(new Error('boom'));
      try {
        await expect(
          service.sendNotificationEmail('a@b.com', 'U', 'T', 'B'),
        ).resolves.toBeUndefined();
      } finally {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
      }
    });
  });

  describe('sendRespondentThankYouEmail', () => {
    it('should skip when SMTP not configured', async () => {
      delete process.env.SMTP_HOST;
      await service.sendRespondentThankYouEmail('a@b.com', 'U', 'Survey', 50);
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should include reward points in email when > 0', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      try {
        await service.sendRespondentThankYouEmail('a@b.com', 'Bob', 'My Survey', 100);
        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const call = sendMailMock.mock.calls[0][0];
        expect(call.html).toContain('100');
        expect(call.html).toContain('My Survey');
      } finally {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
      }
    });

    it('should not include reward line when points are 0', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      try {
        await service.sendRespondentThankYouEmail('a@b.com', 'Bob', 'Free Survey', 0);
        const call = sendMailMock.mock.calls[0][0];
        expect(call.html).not.toContain('獲得');
      } finally {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
      }
    });
  });

  describe('sendDailyDigestEmail', () => {
    it('should skip when SMTP not configured', async () => {
      delete process.env.SMTP_HOST;
      await service.sendDailyDigestEmail('a@b.com', 'U', []);
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should include digest items in table', async () => {
      process.env.SMTP_HOST = 'smtp.test.com';
      process.env.SMTP_USER = 'test@test.com';
      try {
        const items = [
          { surveyTitle: 'Survey A', newCount: 5, totalCount: 20, targetCount: 100 },
          { surveyTitle: 'Survey B', newCount: 2, totalCount: 50, targetCount: 200 },
        ];
        await service.sendDailyDigestEmail('a@b.com', 'User', items);
        const call = sendMailMock.mock.calls[0][0];
        expect(call.html).toContain('Survey A');
        expect(call.html).toContain('+5');
        expect(call.html).toContain('Survey B');
      } finally {
        delete process.env.SMTP_HOST;
        delete process.env.SMTP_USER;
      }
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email with reset URL', async () => {
      await service.sendPasswordResetEmail('user@test.com', 'Alice', 'https://reset?token=xyz');

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const call = sendMailMock.mock.calls[0][0];
      expect(call.to).toBe('user@test.com');
      expect(call.subject).toContain('重設');
      expect(call.html).toContain('https://reset?token=xyz');
      expect(call.html).toContain('Alice');
    });

    it('should throw on SMTP error', async () => {
      sendMailMock.mockRejectedValue(new Error('fail'));
      await expect(
        service.sendPasswordResetEmail('x@y.com', 'U', 'https://r'),
      ).rejects.toThrow('fail');
    });
  });
});
