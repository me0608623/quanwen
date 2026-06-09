import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletService } from './wallet.service';
import { eq, and, sql, inArray } from 'drizzle-orm';
import type { AppDb } from '../db';
import { wallets, transactions, journalEntries, surveys } from '../db/schema';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { SystemConfigService } from '../system-config/system-config.service';

describe('WalletService', () => {
  let service: WalletService;
  let mockDb: any;
  let mockNotifications: any;
  let mockEcpay: any;
  let mockCrypto: any;
  let mockKyc: any;
  let mockSystemConfig: Partial<SystemConfigService>;

  beforeEach(() => {
    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    };
    mockNotifications = {
      create: vi.fn(),
    };
    mockEcpay = {
      buildPaymentForm: vi.fn(),
      parseCallback: vi.fn(),
    };
    mockCrypto = {
      encrypt: vi.fn((s) => s),
    };
    mockKyc = {
      assertKycForWithdrawal: vi.fn(),
    };
    mockSystemConfig = {
      getPlatformFeeRate: vi.fn().mockReturnValue(0.10),
      getPointsValueNtd: vi.fn().mockReturnValue(0.5),
      getMinWithdrawal: vi.fn().mockReturnValue(300),
      getMaxDailyWithdrawal: vi.fn().mockReturnValue(30_000),
      getMinDeposit: vi.fn().mockReturnValue(100),
      getMaxDeposit: vi.fn().mockReturnValue(100_000),
    };

    // Helper to make chainable query builder
    const makeBuilder = (overrides?: Record<string, any>) => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      values: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      ...overrides,
    });

    mockDb.select.mockReturnValue(makeBuilder());
    mockDb.insert.mockReturnValue(makeBuilder());
    mockDb.update.mockReturnValue(makeBuilder());

    service = new WalletService(
      mockDb as unknown as AppDb,
      mockNotifications,
      mockEcpay,
      mockCrypto,
      mockKyc,
      mockSystemConfig as SystemConfigService,
    );
  });

  describe('ensureWallet', () => {
    it('should return existing wallet', async () => {
      const existingWallet = { userId: 'u1', cashBalance: 100, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() };
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([existingWallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const result = await service.ensureWallet('u1');
      expect(result).toEqual(existingWallet);
    });

    it('should create wallet when not exists', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);
      const newWallet = { userId: 'u1', cashBalance: 0, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() };
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        mockResolvedValueOnce: vi.fn().mockResolvedValue([newWallet]),
      };
      mockInsert.returning.mockReturnValue([newWallet]);
      mockDb.insert.mockReturnValueOnce(mockInsert);

      const result = await service.ensureWallet('u1');
      expect(result).toEqual(newWallet);
    });
  });

  describe('getWallet', () => {
    it('should return wallet or null', async () => {
      const wallet = { userId: 'u1', cashBalance: 100, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() };
      
      // First call: ensureWallet checks if wallet exists
      const mockSelectEnsure = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([wallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectEnsure);

      // Second call: getWallet actually reads wallet
      const mockSelectGet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([wallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectGet);

      const result = await service.getWallet('u1');
      expect(result).toEqual(wallet);
    });

    it('should return null when no wallet', async () => {
      // First call: ensureWallet creates wallet
      const mockSelectEnsure = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectEnsure);

      // ensureWallet creates wallet
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ userId: 'u1', cashBalance: 0, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() }]),
      };
      mockDb.insert.mockReturnValueOnce(mockInsert);

      // Second call: getWallet reads wallet
      const mockSelectGet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectGet);

      const result = await service.getWallet('u1');
      expect(result).toBeNull();
    });
  });

  describe('getTransactions', () => {
    it('should return transactions with limit', async () => {
      const txns = [{ id: 't1', userId: 'u1', amount: 50, type: 'reward_in', status: 'success', createdAt: new Date() }];
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(txns),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const result = await service.getTransactions('u1', 10);
      expect(result).toEqual(txns);
    });
  });

  describe('createEcpayOrder', () => {
    beforeEach(() => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ userId: 'u1', cashBalance: 0, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() }]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'abc-123' }]),
      };
      mockDb.insert.mockReturnValueOnce(mockInsert);

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValueOnce(mockUpdate);

      mockEcpay.buildPaymentForm.mockReturnValue('<form>...</form>');
    });

    it('should create ECPay order successfully', async () => {
      const html = await service.createEcpayOrder('u1', 1000);
      expect(html).toContain('<form>');
      expect(mockEcpay.buildPaymentForm).toHaveBeenCalled();
    });

    it('should throw for amount below 100', async () => {
      await expect(service.createEcpayOrder('u1', 50)).rejects.toThrow(BadRequestException);
    });

    it('should throw for amount above 100000', async () => {
      await expect(service.createEcpayOrder('u1', 200000)).rejects.toThrow(BadRequestException);
    });
  });

  describe('processEcpayCallback', () => {
    it('should return "0|ErrorCheckMacValue" when invalid', async () => {
      mockEcpay.parseCallback.mockReturnValue({ valid: false, merchantTradeNo: 'TEST001' });
      const result = await service.processEcpayCallback({ MerchantTradeNo: 'TEST001', CheckMacValue: 'bad' });
      expect(result).toBe('0|ErrorCheckMacValue');
    });

    it('should treat missing txn as idempotent and return "1|OK"', async () => {
      mockEcpay.parseCallback.mockReturnValue({ valid: true, merchantTradeNo: 'TEST001', rtnCode: '1', rtnMsg: 'OK', tradeNo: 'EC002' });
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const result = await service.processEcpayCallback({ MerchantTradeNo: 'TEST001', RtnCode: '1' });
      expect(result).toBe('1|OK');
    });

    it('should return "1|OK" for duplicate processed (success) txn', async () => {
      mockEcpay.parseCallback.mockReturnValue({ valid: true, merchantTradeNo: 'TEST001', rtnCode: '1', rtnMsg: 'OK', tradeNo: 'EC002' });
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 't1', status: 'success', userId: 'u1', amount: 1000 }]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const result = await service.processEcpayCallback({ MerchantTradeNo: 'TEST001', RtnCode: '1' });
      expect(result).toBe('1|OK');
    });

    it('should handle failed payment', async () => {
      mockEcpay.parseCallback.mockReturnValue({ valid: true, merchantTradeNo: 'TEST001', rtnCode: '0', rtnMsg: 'Failed', tradeNo: 'EC002' });
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 't1', status: 'pending', userId: 'u1', amount: 1000 }]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const mockUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDb.update.mockReturnValueOnce(mockUpdate);

      const result = await service.processEcpayCallback({ MerchantTradeNo: 'TEST001', RtnCode: '0' });
      expect(result).toBe('1|OK');
    });

    it('should credit wallet on successful payment', async () => {
      mockEcpay.parseCallback.mockReturnValue({ valid: true, merchantTradeNo: 'TEST001', rtnCode: '1', rtnMsg: 'OK', tradeNo: 'EC002' });
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 't1', status: 'pending', userId: 'u1', amount: 1000 }]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const mockTxUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 't1' }]),
      };
      const mockTxInsert = {
        values: vi.fn().mockResolvedValue(undefined),
      };
      const mockWalletUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.update.mockReturnValueOnce(mockTxUpdate);
      mockDb.insert.mockReturnValueOnce(mockTxInsert);
      mockDb.update.mockReturnValueOnce(mockWalletUpdate);

      let txCallback: ((tx: any) => Promise<void>) | undefined;
      mockDb.transaction.mockImplementation((cb: (tx: any) => Promise<void>) => {
        txCallback = cb;
        return cb({
          update: vi.fn(() => mockTxUpdate),
          insert: vi.fn(() => mockTxInsert),
        });
      });

      const result = await service.processEcpayCallback({ MerchantTradeNo: 'TEST001', RtnCode: '1' });
      expect(result).toBe('1|OK');
      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe('mockDeposit', () => {
    it('should create deposit and update wallet', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const mockTxInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
      };
      mockTxInsert.returning.mockReturnValue([{ id: 't1' }]);

      const mockWalletUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue(undefined),
      };

      mockDb.insert.mockReturnValueOnce(mockTxInsert);
      mockDb.update.mockReturnValueOnce(mockWalletUpdate);

      mockDb.transaction.mockImplementation((cb: (tx: any) => Promise<void>) => {
        return cb({
          insert: vi.fn(() => mockTxInsert),
          update: vi.fn(() => mockWalletUpdate),
        });
      });

      await service.mockDeposit('u1', 500);
      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe('issueReward', () => {
    it('should return "skipped" for non-positive reward', async () => {
      const result = await service.issueReward({ surveyId: 's1', responseId: 'r1', respondentId: 'a1', surveyorId: 'b1', rewardAmount: 0 });
      expect(result).toEqual({ status: 'skipped' });
    });

    it('should return "success" when balance is sufficient', async () => {
      // Mock notifications.create to return a promise with catch
      mockNotifications.create.mockResolvedValue({ id: 'n1' });

      // Mock ensureWallet x2 (surveyor and respondent)
      const mockSelectNoWallet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectNoWallet).mockReturnValueOnce(mockSelectNoWallet);

      // Mock transaction callback with proper chainable mocks
      const makeTxInsert = () => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 't1' }]),
      });

      // Mock check for duplicate reward inside transaction
      const mockTxSelectCheckDup = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      // Mock check surveyor balance inside transaction
      const mockTxSelectBal = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ locked: 150, cash: 500, version: 1 }]),
      };

      // Mock atomic deduction
      const mockTxUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'w1', cashBalance: 400, lockedCash: 100, version: 2 }]),
      };

      // Mock wallet credit
      const mockWalletCredit = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      // Mock journal entries
      const mockJInsert = {
        values: vi.fn().mockResolvedValue(undefined),
      };

      let txSelectCallCount = 0;
      let txUpdateCallCount = 0;
      let txInsertCallCount = 0;
      
      mockDb.transaction.mockImplementation((cb: (tx: any) => Promise<void>) => {
        return cb({
          select: vi.fn(() => {
            txSelectCallCount++;
            if (txSelectCallCount === 1) return mockTxSelectCheckDup;  // First call: check duplicate
            return mockTxSelectBal;  // Second call: check balance
          }),
          update: vi.fn(() => {
            txUpdateCallCount++;
            if (txUpdateCallCount === 1) return mockTxUpdate;  // Deduct from surveyor
            return mockWalletCredit;  // Credit to respondent
          }),
          insert: vi.fn(() => {
            txInsertCallCount++;
            if (txInsertCallCount <= 3) return makeTxInsert();  // First 3 calls: transactions
            return mockJInsert;  // Later calls: journal entries
          }),
        });
      });

      const result = await service.issueReward({ surveyId: 's1', responseId: 'r1', respondentId: 'a1', surveyorId: 'b1', rewardAmount: 100 });
      expect(result).toEqual({ status: 'success' });
    });

    it('should return "pending" when balance insufficient', async () => {
      // Mock ensureWallet x2
      const mockSelectNoWallet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectNoWallet).mockReturnValueOnce(mockSelectNoWallet);

      // Mock check duplicate - return empty to indicate no duplicate
      const mockSelectCheckDup = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectCheckDup);

      // Mock balance insufficient - only 50 available for 100 reward
      const mockSelectBal = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ locked: 50, cash: 0, version: 1 }]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectBal);

      // Mock atomic deduction fails
      const mockTxUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
      };
      mockDb.update.mockReturnValueOnce(mockTxUpdate);

      // Mock transaction insertion
      const mockTxInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 't1' }]),
      };
      mockDb.insert.mockReturnValueOnce(mockTxInsert).mockReturnValueOnce(mockTxInsert).mockReturnValueOnce(mockTxInsert);

      mockDb.transaction.mockImplementation((cb: (tx: any) => Promise<void>) => {
        return cb({
          select: vi.fn(() => mockSelectCheckDup),
          update: vi.fn(() => mockTxUpdate),
          insert: vi.fn(() => mockTxInsert),
        });
      });

      const result = await service.issueReward({ surveyId: 's1', responseId: 'r1', respondentId: 'a1', surveyorId: 'b1', rewardAmount: 100 });
      expect(result).toEqual({ status: 'pending' });
    });

    it('should return "duplicate" for concurrent duplicate', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect).mockReturnValueOnce(mockSelect);
      const err = { code: '23505' };
      mockDb.transaction.mockRejectedValue(err);

      const result = await service.issueReward({ surveyId: 's1', responseId: 'r1', respondentId: 'a1', surveyorId: 'b1', rewardAmount: 100 });
      expect(result).toEqual({ status: 'duplicate' });
    });
  });

  describe('requestWithdrawal', () => {
    const MIN_WITHDRAWAL = 300;
    const MAX_DAILY_WITHDRAWAL = 30_000;

    it('should throw for amount below MIN_WITHDRAWAL', async () => {
      await expect(service.requestWithdrawal('u1', 100, { bankCode: '004', bankAccount: '1234567890', accountName: 'A' })).rejects.toThrow(BadRequestException);
    });

    it('should call kyc.assertKycForWithdrawal for >= 2000', async () => {
      // Mock wallet exists
      const mockWallet = { cashBalance: 5000, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() };
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockWallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      // Mock daily limit
      const mockSelectDaily = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ total: 0 }]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectDaily);

      // Mock transactional deduction and insert
      const mockTxUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'w1' }]),
      };
      mockDb.update.mockReturnValueOnce(mockTxUpdate);

      const mockTxInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 't1' }]),
      };
      mockDb.insert.mockReturnValueOnce(mockTxInsert);

      mockDb.transaction.mockImplementation((cb: (tx: any) => Promise<void>) => {
        return cb({
          update: vi.fn(() => mockTxUpdate),
          insert: vi.fn(() => mockTxInsert),
        });
      });

      await service.requestWithdrawal('u1', 2000, { bankCode: '004', bankAccount: '1234567890', accountName: 'A' });
      expect(mockKyc.assertKycForWithdrawal).toHaveBeenCalledWith('u1', 2000);
    });

    it('should enforce daily limit', async () => {
      // Mock getWallet call inside requestWithdrawal
      const mockWallet = { cashBalance: 5000, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() };
      const mockSelectWallet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockWallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectWallet);

      // Mock ensureWallet call (also uses getWallet)
      mockDb.select.mockReturnValueOnce(mockSelectWallet);

      // Mock daily limit check
      const mockSelectDaily = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      };
      mockDb.select.mockReturnValueOnce(mockSelectDaily);
      // Mock the SQL aggregation result
      const dailyLimitResult = [{ total: MAX_DAILY_WITHDRAWAL - 1000 }];
      mockSelectDaily.where.mockResolvedValueOnce(dailyLimitResult);

      // This should throw because daily limit would be exceeded (29000 + 2000 > 30000)
      await expect(service.requestWithdrawal('u1', 2000, { bankCode: '004', bankAccount: '1234567890', accountName: 'A' })).rejects.toThrow(BadRequestException);
    });

    it('should create pending withdrawal and lock balance', async () => {
      // Mock getWallet call inside requestWithdrawal
      const mockWallet = { cashBalance: 5000, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() };
      const mockSelectWallet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockWallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectWallet);

      // Mock ensureWallet call (also uses getWallet)
      mockDb.select.mockReturnValueOnce(mockSelectWallet);

      // Mock daily limit check
      const mockSelectDaily = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      };
      mockDb.select.mockReturnValueOnce(mockSelectDaily);
      // Mock the SQL aggregation result - 0 used today
      const dailyLimitResult = [{ total: 0 }];
      mockSelectDaily.where.mockResolvedValueOnce(dailyLimitResult);

      const mockTxUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'w1' }]),
      };
      mockDb.update.mockReturnValueOnce(mockTxUpdate);

      const mockTxInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 't1' }]),
      };
      mockDb.insert.mockReturnValueOnce(mockTxInsert);

      mockDb.transaction.mockImplementation((cb: (tx: any) => Promise<void>) => {
        return cb({
          update: vi.fn(() => mockTxUpdate),
          insert: vi.fn(() => mockTxInsert),
        });
      });

      const result = await service.requestWithdrawal('u1', 500, { bankCode: '004', bankAccount: '1234567890', accountName: 'A' });
      expect(result).toEqual({ transactionId: 't1' });
    });
  });

  describe('checkSurveyBudget', () => {
    it('should return sufficient=false when balance insufficient', async () => {
      const mockWallet = { cashBalance: 100, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() };
      
      // Mock ensureWallet
      const mockSelectWallet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockWallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectWallet);

      // Mock getWallet call inside checkSurveyBudget
      const mockSelectGetWallet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockWallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectGetWallet);

      const mockSelectSurvey = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ id: 's1', rewardPoints: 50, targetCount: 10, surveyorId: 'b1' }]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectSurvey);

      const result = await service.checkSurveyBudget('b1', 's1');
      expect(result.sufficient).toBe(false);
    });

    it('should throw when survey not found', async () => {
      const mockWallet = { cashBalance: 0, lockedCash: 0, pointsBalance: 0, version: 1, createdAt: new Date(), updatedAt: new Date() };
      const mockSelectWallet = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockWallet]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectWallet);

      const mockSelectSurvey = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectSurvey);

      await expect(service.checkSurveyBudget('b1', 's1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEarningsSummary', () => {
    it('should return summary with total and monthly breakdown', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const mockAllRewards = [
        { amount: 100, status: 'success', relatedSurveyId: 's1', completedAt: new Date(), createdAt: new Date() },
        { amount: 50, status: 'pending', relatedSurveyId: 's2', completedAt: null, createdAt: new Date() },
      ];
      // Mock the orderBy result to resolve to the array
      mockSelect.orderBy.mockResolvedValueOnce(mockAllRewards);

      // Mock survey titles query
      const mockSelectSurveyTitles = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: 's1', title: 'Survey 1' }]),
      };
      mockDb.select.mockReturnValueOnce(mockSelectSurveyTitles);

      const summary = await service.getEarningsSummary('u1');
      expect(summary.totalEarned).toBe(100);
      expect(summary.pendingRewards).toBe(50);
    });

    it('should handle empty rewards', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);
      // Mock the orderBy result to resolve to empty array
      mockSelect.orderBy.mockResolvedValueOnce([]);

      const summary = await service.getEarningsSummary('u1');
      expect(summary.totalEarned).toBe(0);
      expect(summary.pendingRewards).toBe(0);
    });
  });

  describe('grantPoints', () => {
    it('should create points transaction and update wallet', async () => {
      const mockSelect = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      mockDb.select.mockReturnValueOnce(mockSelect);

      const mockTxInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 't1' }]),
      };
      
      const mockWalletUpdate = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };

      const mockJInsert = {
        values: vi.fn().mockResolvedValue(undefined),
      };

      let txInsertCallCount = 0;
      
      mockDb.transaction.mockImplementation((cb: (tx: any) => Promise<void>) => {
        return cb({
          insert: vi.fn(() => {
            txInsertCallCount++;
            if (txInsertCallCount === 1) return mockTxInsert;  // First call: insert transaction
            return mockJInsert;  // Second call: insert journal entries
          }),
          update: vi.fn(() => mockWalletUpdate),
        });
      });

      await service.grantPoints('u1', 100, 'bonus');
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('should skip non-positive points', async () => {
      await service.grantPoints('u1', 0, 'bonus');
      expect(mockDb.insert).not.toHaveBeenCalled();
    });
  });
});