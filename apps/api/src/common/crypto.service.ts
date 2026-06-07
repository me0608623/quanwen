import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Phase B：應用層 PII 加密（AES-256-GCM）。
 *
 * 法規依據：
 * - 個資法（PIPA）：身分證號、銀行帳號屬於「特種個資」性質的敏感資料
 * - 罰則：個資外洩可罰 NT$1,500 萬
 *
 * 設計原則：
 * 1. 主金鑰 PII_ENCRYPTION_KEY 從環境變數讀，dev 退回 fixed dev key（會 log warning）
 * 2. 每筆加密用 random IV（12 bytes for GCM）+ auth tag（16 bytes）
 * 3. 輸出格式：`v1:<iv_base64>:<authTag_base64>:<cipher_base64>`，版本前綴方便日後輪替金鑰
 * 4. decrypt 失敗 throw 而非靜默回 null（避免破解攻擊靜默通過）
 */
/** 顯示給「非管理員」看的加密答案佔位字串（個資加密題） */
export const ENCRYPTED_ANSWER_PLACEHOLDER = '🔒 已加密（僅管理員可見）';

/**
 * 純函式：判斷字串是否為 CryptoService 密文格式 `v1:iv:tag:ct`（4 段、首段 v1、其餘 base64）。
 * 不需金鑰，供匯出層等無 DI 處遮蔽加密答案用。自然明文幾乎不可能命中此格式。
 */
export function looksEncryptedCipher(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const b64 = /^[A-Za-z0-9+/]+={0,2}$/;
  return parts.slice(1).every((p) => p.length > 0 && b64.test(p));
}

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;
  private readonly version = 'v1';

  constructor() {
    const raw = process.env.PII_ENCRYPTION_KEY;
    // Phase K.3：salt 也支援 env override（prod 必設、避免靜態 salt 弱化 KDF）
    // dev fallback：用 fixed salt 確保 dev/seed 加密的資料每次 boot 都能解（重啟資料才能延續）
    const salt = process.env.PII_KDF_SALT ?? 'quanwen-salt';
    if (!raw) {
      if (process.env.NODE_ENV === 'production') {
        throw new InternalServerErrorException(
          'PII_ENCRYPTION_KEY env var is required in production',
        );
      }
      // dev 用 fixed key + fixed salt
      this.logger.warn('⚠️  PII_ENCRYPTION_KEY not set; using DEV fallback key (NOT secure for prod)');
      this.key = scryptSync('dev-fallback-pii-key-do-not-use-in-prod', salt, 32);
    } else {
      if (process.env.NODE_ENV === 'production' && !process.env.PII_KDF_SALT) {
        this.logger.warn(
          '⚠️  PII_KDF_SALT not set in production; using default salt (weakens KDF security). Set PII_KDF_SALT to a unique random 16-byte hex string.',
        );
      }
      this.key = scryptSync(raw, salt, 32);
    }
  }

  /** 加密任意字串 → 自描述密文 */
  encrypt(plain: string): string {
    if (plain === null || plain === undefined) {
      throw new Error('CryptoService.encrypt: input is null/undefined');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${this.version}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /** 解密自描述密文 → 原始字串 */
  decrypt(cipherText: string): string {
    if (!cipherText) throw new Error('CryptoService.decrypt: empty input');
    const parts = cipherText.split(':');
    if (parts.length !== 4) {
      throw new Error(`CryptoService.decrypt: invalid format (expected v1:iv:tag:ct, got ${parts.length} parts)`);
    }
    const [version, ivB64, tagB64, ctB64] = parts;
    if (version !== this.version) {
      throw new Error(`CryptoService.decrypt: unsupported version ${version}`);
    }
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString('utf8');
  }

  /** 安全 decrypt：失敗回 null（用於 best-effort 顯示，例如 admin 看部分欄位） */
  tryDecrypt(cipherText: string | null | undefined): string | null {
    if (!cipherText) return null;
    try {
      return this.decrypt(cipherText);
    } catch (err) {
      this.logger.warn(`tryDecrypt failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** 是否已加密（粗略判斷，用於 migration 過渡期）*/
  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(`${this.version}:`);
  }

  // ─── PII 去識別化（給 AI / LLM 前用）────────────────────────────────────

  /**
   * 把字串中的 PII 替成 token，避免送進 LLM。
   * 順序：先做更具體的 pattern（信用卡含空格/dash > 連續長數字 > 身分證 > 手機 > email），避免相互覆蓋
   */
  redactPii(text: string): string {
    if (!text) return text;
    return text
      // 1. 信用卡格式（含空格/dash 的 13-19 位數字組）
      .replace(/\b(?:\d[ -]){12,18}\d\b/g, '[CARD]')
      // 2. 台灣身分證號（A123456789）
      .replace(/\b[A-Z][12]\d{8}\b/g, '[ID]')
      // 3. 國際 / 國內手機號（要在 BANK 前，因 09xxxxxxxx 是 10 位數字）
      .replace(/\+886[- ]?9\d{2}[- ]?\d{3}[- ]?\d{3}/g, '[PHONE]')
      .replace(/\b09\d{2}[- ]?\d{3}[- ]?\d{3}\b/g, '[PHONE]')
      // 3a. 市話（02-XXXX / 037-XXXX 等格式）
      .replace(/\b0\d{1,2}[-\s]\d{6,8}\b/g, '[PHONE]')
      // 4. 連續長數字 → 銀行帳號（10-16 位；09 開頭已被上面 PHONE 規則吃掉）
      .replace(/\b\d{10,16}\b/g, '[BANK]')
      // 5. email
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  }
}
