import { describe, expect, it, beforeAll } from 'vitest';
import { CryptoService, looksEncryptedCipher } from './crypto.service';

describe('looksEncryptedCipher', () => {
  it('辨識真實密文，且不誤判明文', () => {
    const enc = new CryptoService().encrypt('王小明 0912345678 台北市信義區');
    expect(looksEncryptedCipher(enc)).toBe(true);
    // 明文 / 其他格式不應誤判（避免過度遮蔽）
    expect(looksEncryptedCipher('王小明')).toBe(false);
    expect(looksEncryptedCipher('我覺得 v1 很好用：真的')).toBe(false);
    expect(looksEncryptedCipher('{"陳述A":{"同意":true}}')).toBe(false);
    expect(looksEncryptedCipher('')).toBe(false);
    expect(looksEncryptedCipher(null)).toBe(false);
    expect(looksEncryptedCipher(undefined)).toBe(false);
    expect(looksEncryptedCipher('v2:a:b:c')).toBe(false);
  });
});

describe('CryptoService', () => {
  let svc: CryptoService;

  beforeAll(() => {
    // dev fallback key — deterministic 不需要 set env
    svc = new CryptoService();
  });

  describe('encrypt + decrypt round-trip', () => {
    it.each([
      'A123456789',
      '0912345678',
      '陳測試',
      '我的銀行帳號 01234567890123',
      'special !@#$%^&*()+=',
      '', // 空字串
    ])('correctly round-trips %s', (plain) => {
      if (plain === '') {
        expect(() => svc.encrypt(plain)).not.toThrow();
        const cipher = svc.encrypt(plain);
        expect(svc.decrypt(cipher)).toBe(plain);
      } else {
        const cipher = svc.encrypt(plain);
        // 自描述密文格式：v1:iv:tag:ct
        expect(cipher).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
        expect(svc.decrypt(cipher)).toBe(plain);
      }
    });

    it('two encrypts of same plaintext produce different ciphertexts (random IV)', () => {
      const plain = 'A123456789';
      const c1 = svc.encrypt(plain);
      const c2 = svc.encrypt(plain);
      expect(c1).not.toBe(c2);
      expect(svc.decrypt(c1)).toBe(plain);
      expect(svc.decrypt(c2)).toBe(plain);
    });

    it('throws on null/undefined input', () => {
       
      expect(() => svc.encrypt(null as any)).toThrow();
       
      expect(() => svc.encrypt(undefined as any)).toThrow();
    });

    it('throws on tampered ciphertext (auth tag mismatch)', () => {
      const cipher = svc.encrypt('A123456789');
      const tampered = cipher.slice(0, -4) + 'XXXX';
      expect(() => svc.decrypt(tampered)).toThrow();
    });

    it('throws on wrong format', () => {
      expect(() => svc.decrypt('not-a-valid-format')).toThrow();
      expect(() => svc.decrypt('v999:a:b:c')).toThrow();
    });
  });

  describe('tryDecrypt', () => {
    it('returns null for invalid input instead of throwing', () => {
      expect(svc.tryDecrypt(null)).toBeNull();
      expect(svc.tryDecrypt(undefined)).toBeNull();
      expect(svc.tryDecrypt('garbage')).toBeNull();
    });

    it('returns decrypted plain for valid ciphertext', () => {
      const cipher = svc.encrypt('hello');
      expect(svc.tryDecrypt(cipher)).toBe('hello');
    });
  });

  describe('isEncrypted', () => {
    it('detects v1 prefix', () => {
      expect(svc.isEncrypted(svc.encrypt('x'))).toBe(true);
      expect(svc.isEncrypted('plain text')).toBe(false);
      expect(svc.isEncrypted(null)).toBe(false);
      expect(svc.isEncrypted(undefined)).toBe(false);
    });
  });

  describe('redactPii', () => {
    it('redacts Taiwan national ID', () => {
      expect(svc.redactPii('身分證 A123456789 是我的')).toBe('身分證 [ID] 是我的');
      expect(svc.redactPii('B234567891 / F213456789')).toBe('[ID] / [ID]');
    });

    it('redacts phone numbers', () => {
      expect(svc.redactPii('我手機 0912345678')).toBe('我手機 [PHONE]');
      expect(svc.redactPii('+886912345678')).toBe('[PHONE]');
      expect(svc.redactPii('0912-345-678')).toBe('[PHONE]');
    });

    it('redacts emails', () => {
      expect(svc.redactPii('我的 email foo@bar.com 給你')).toBe('我的 email [EMAIL] 給你');
    });

    it('redacts bank account numbers (10-16 digits)', () => {
      expect(svc.redactPii('帳號 01234567890123 請匯款')).toBe('帳號 [BANK] 請匯款');
    });

    it('preserves non-PII text', () => {
      expect(svc.redactPii('我喜歡吃便當')).toBe('我喜歡吃便當');
      expect(svc.redactPii('123 太短不會被當銀行帳')).toBe('123 太短不會被當銀行帳');
    });

    it('handles empty / undefined input', () => {
      expect(svc.redactPii('')).toBe('');
       
      expect(svc.redactPii(null as any)).toBe(null);
    });

    it('redacts multiple PII types in same string', () => {
      const input = '我 A123456789 手機 0912345678 email a@b.com';
      const out = svc.redactPii(input);
      expect(out).toContain('[ID]');
      expect(out).toContain('[PHONE]');
      expect(out).toContain('[EMAIL]');
    });
  });
});
