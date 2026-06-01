import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  forwardRef,
} from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { DB } from '../db';
import type { AppDb } from '../db';
import { kycVerifications } from '../db/schema';
import { CryptoService } from '../common/crypto.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MultiAccountDetectorService } from '../admin/multi-account-detector.service';

const TAIWAN_ID_REGEX = /^[A-Z][12]\d{8}$/;
const TAIWAN_PHONE_REGEX = /^09\d{2}\d{6}$/;
export const KYC_REQUIRED_THRESHOLD = 2000; // 提領達此金額需 KYC

export interface KycSubmitInput {
  idNumber: string;     // A123456789
  realName: string;     // 王小明
  phone: string;        // 0912345678
  idFrontUrl?: string;  // 簡化：可空（demo 不強制上傳）
  idBackUrl?: string;
  selfieUrl?: string;
}

/**
 * Phase B：KYC 流程服務
 *
 * Workflow：
 *  1. 受試者首次提領 ≥ NT$2,000 → 觸發 KYC required gate
 *  2. 受試者提交 KYC 表單（id_number / real_name / phone + 證件影像）
 *  3. PII 欄位走 CryptoService 加密儲存
 *  4. status: submitted → admin 審 → approved/rejected
 *  5. approved 後可繼續提領；rejected 需重交
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @Inject(DB) private readonly db: AppDb,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
    @Inject(forwardRef(() => MultiAccountDetectorService))
    private readonly detector: MultiAccountDetectorService,
  ) {}

  /** 取得用戶 KYC 狀態（含解密欄位，供 admin 看）*/
  async getStatus(userId: string, includeDecrypted = false) {
    const rows = await this.db
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.userId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return { status: 'unverified' as const, hasRecord: false };
    }
    const base = {
      status: row.status,
      hasRecord: true,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      adminNote: row.adminNote,
    };
    if (!includeDecrypted) {
      // 受試者自看：只回 status，PII 不回
      return base;
    }
    return {
      ...base,
      idNumber: this.crypto.tryDecrypt(row.idNumberCipher),
      realName: this.crypto.tryDecrypt(row.realNameCipher),
      phone: this.crypto.tryDecrypt(row.phoneCipher),
      idFrontUrl: row.idFrontUrl,
      idBackUrl: row.idBackUrl,
      selfieUrl: row.selfieUrl,
    };
  }

  /** 提交 KYC：upsert + 加密 PII */
  async submit(userId: string, input: KycSubmitInput) {
    if (!TAIWAN_ID_REGEX.test(input.idNumber)) {
      throw new BadRequestException('身分證號格式錯誤（應為 1 英文 + 9 數字）');
    }
    if (!TAIWAN_PHONE_REGEX.test(input.phone)) {
      throw new BadRequestException('手機號格式錯誤（應為 09xxxxxxxx）');
    }
    if (!input.realName || input.realName.trim().length < 2) {
      throw new BadRequestException('真實姓名至少 2 字');
    }

    const existing = await this.db
      .select({ id: kycVerifications.id, status: kycVerifications.status })
      .from(kycVerifications)
      .where(eq(kycVerifications.userId, userId))
      .limit(1);

    const now = new Date();
    const encryptedFields = {
      idNumberCipher: this.crypto.encrypt(input.idNumber.toUpperCase().trim()),
      realNameCipher: this.crypto.encrypt(input.realName.trim()),
      phoneCipher: this.crypto.encrypt(input.phone.trim()),
      idFrontUrl: input.idFrontUrl ?? null,
      idBackUrl: input.idBackUrl ?? null,
      selfieUrl: input.selfieUrl ?? null,
      status: 'submitted' as const,
      submittedAt: now,
      updatedAt: now,
      adminNote: null,
      reviewedBy: null,
      reviewedAt: null,
    };

    if (existing[0]) {
      if (existing[0].status === 'approved') {
        throw new ConflictException('已通過 KYC，無需重交');
      }
      await this.db
        .update(kycVerifications)
        .set(encryptedFields)
        .where(eq(kycVerifications.id, existing[0].id));
    } else {
      await this.db.insert(kycVerifications).values({
        userId,
        ...encryptedFields,
      });
    }

    this.logger.log(`KYC submitted: user=${userId}`);

    // Phase D.6：KYC 提交時跑多帳號偵測（fire-and-forget，不卡 UX）
    void this.detector
      .scanAndAlertIfRisky(userId, 'KYC 提交')
      .catch((err) => this.logger.error(`多帳號偵測 KYC 失敗 user=${userId}`, err));

    return { message: 'KYC 已提交，等待管理員審核', status: 'submitted' };
  }

  /** Admin: 列出 pending KYC */
  async listPending() {
    const rows = await this.db
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.status, 'submitted'))
      .orderBy(desc(kycVerifications.submittedAt))
      .limit(100);

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      // 解密 PII 給 admin 看
      idNumber: this.crypto.tryDecrypt(r.idNumberCipher),
      realName: this.crypto.tryDecrypt(r.realNameCipher),
      phone: this.crypto.tryDecrypt(r.phoneCipher),
      idFrontUrl: r.idFrontUrl,
      idBackUrl: r.idBackUrl,
      selfieUrl: r.selfieUrl,
      submittedAt: r.submittedAt,
    }));
  }

  async approve(kycId: string, adminId: string, adminNote?: string) {
    const row = await this.assertPending(kycId);
    if (row.userId === adminId) {
      throw new ForbiddenException('管理員不可核准自己的 KYC 申請');
    }
    const now = new Date();
    await this.db
      .update(kycVerifications)
      .set({
        status: 'approved',
        adminNote: adminNote?.slice(0, 500) ?? null,
        reviewedBy: adminId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(kycVerifications.id, kycId));

    await this.notifications.create({
      userId: row.userId,
      type: 'system',
      title: 'KYC 通過審核',
      body: '您的身份驗證已通過，現在可以申請大額提領。',
      metadata: { kycId },
    });
    return { message: 'KYC 已核准', kycId };
  }

  async reject(kycId: string, adminId: string, adminNote: string) {
    if (!adminNote || adminNote.trim().length < 5) {
      throw new BadRequestException('駁回需附說明（至少 5 字）');
    }
    const row = await this.assertPending(kycId);
    if (row.userId === adminId) {
      throw new ForbiddenException('管理員不可駁回自己的 KYC 申請');
    }
    const now = new Date();
    await this.db
      .update(kycVerifications)
      .set({
        status: 'rejected',
        adminNote: adminNote.trim().slice(0, 500),
        reviewedBy: adminId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(kycVerifications.id, kycId));

    await this.notifications.create({
      userId: row.userId,
      type: 'system',
      title: 'KYC 審核未通過',
      body: `原因：${adminNote.trim()}。請重新提交。`,
      metadata: { kycId },
    });
    return { message: 'KYC 已駁回', kycId };
  }

  /** 受試者提領金額 ≥ threshold 時呼叫；若未驗證會 throw */
  async assertKycForWithdrawal(userId: string, amount: number) {
    if (amount < KYC_REQUIRED_THRESHOLD) return;
    const rows = await this.db
      .select({ status: kycVerifications.status })
      .from(kycVerifications)
      .where(eq(kycVerifications.userId, userId))
      .limit(1);
    const status = rows[0]?.status ?? 'unverified';
    if (status !== 'approved') {
      throw new BadRequestException(
        `提領金額 ≥ NT$${KYC_REQUIRED_THRESHOLD} 需先完成身份驗證（KYC）。目前狀態：${kycStatusLabel(status)}`,
      );
    }
  }

  private async assertPending(kycId: string) {
    const rows = await this.db
      .select()
      .from(kycVerifications)
      .where(eq(kycVerifications.id, kycId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException('KYC 紀錄不存在');
    if (row.status !== 'submitted') {
      throw new BadRequestException(`KYC 狀態為 ${row.status}，無法審核`);
    }
    return row;
  }
}

function kycStatusLabel(status: string): string {
  switch (status) {
    case 'unverified': return '未驗證';
    case 'submitted':  return '審核中';
    case 'approved':   return '已通過';
    case 'rejected':   return '已駁回，請重新提交';
    default:           return status;
  }
}
