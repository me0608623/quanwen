import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/** Phase F.1：避免 XSS（雖然只有 admin/system 內容會進來，仍 escape 為佳）*/
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor() {
    this.from = process.env.MAIL_FROM ?? 'QuanWen <noreply@quanwen.tw>';

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
      },
    });
  }

  async sendVerificationEmail(to: string, displayName: string, verifyUrl: string): Promise<void> {
    const subject = '【券問】驗證您的電子郵件';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">驗證您的電子郵件</h2>
        <p>您好，${escapeHtml(displayName)}，</p>
        <p>感謝您加入券問！請點擊下方按鈕完成電子郵件驗證：</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${verifyUrl}"
             style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;display:inline-block">
            驗證電子郵件
          </a>
        </div>
        <p style="color:#666;font-size:14px">此連結將在 <strong>24 小時</strong>後失效。</p>
        <p style="color:#666;font-size:14px">若您沒有建立券問帳號，請忽略此郵件。</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:12px">券問 QuanWen · 台灣雙邊問卷平台</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}`, err);
      throw err;
    }
  }

  /**
   * Phase F.1：通用通知 email（從 notifications.service 觸發）
   * 只在 SMTP_HOST 與 SMTP_USER 都設定時實際送出，dev 無設定時靜默跳過
   */
  async sendNotificationEmail(
    to: string,
    displayName: string,
    title: string,
    body: string,
  ): Promise<void> {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      this.logger.debug(`[noop] notification email to ${to}: ${title}`);
      return;
    }
    const subject = `【券問】${title}`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">${escapeHtml(title)}</h2>
        <p>您好，${escapeHtml(displayName)}，</p>
        <div style="white-space:pre-wrap;line-height:1.6;color:#333">${escapeHtml(body)}</div>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:12px">
          券問 QuanWen · 台灣雙邊問卷平台<br/>
          <a href="${process.env.WEB_URL ?? 'https://quanwen.tw'}/profile/notifications">查看完整通知</a>
        </p>
      </div>
    `;

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed to send notification email to ${to} (${title})`, err);
      // 不 re-throw — email 失敗不該卡住業務流程
    }
  }

  async sendPasswordResetEmail(to: string, displayName: string, resetUrl: string): Promise<void> {
    const subject = '【券問】重設密碼';
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1a1a">重設您的密碼</h2>
        <p>您好，${escapeHtml(displayName)}，</p>
        <p>我們收到了重設券問帳號密碼的請求。點擊下方按鈕完成設定：</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${resetUrl}"
             style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;display:inline-block">
            重設密碼
          </a>
        </div>
        <p style="color:#666;font-size:14px">此連結將在 <strong>1 小時</strong>後失效。</p>
        <p style="color:#666;font-size:14px">若您沒有提出此請求，請忽略此郵件。</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#999;font-size:12px">券問 QuanWen · 台灣雙邊問卷平台</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${to}`, err);
      throw err;
    }
  }
}
