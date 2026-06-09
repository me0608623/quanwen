import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationsService } from './notifications.service';
import type { AppDb } from '../db';
import type { PendingNotification } from '../db/schema';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockDb: Record<string, ReturnType<typeof vi.fn>>;
  let mockMail: Record<string, ReturnType<typeof vi.fn>>;

  /** Returns a Drizzle-like query chain whose final `.returning()` resolves to `result` */
  const makeChain = (result: unknown[] = []) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.from = vi.fn(self);
    chain.where = vi.fn(self);
    chain.limit = vi.fn(self);
    chain.orderBy = vi.fn(self);
    chain.innerJoin = vi.fn(self);
    chain.groupBy = vi.fn(self);
    chain.set = vi.fn(self);
    chain.values = vi.fn().mockResolvedValue(result); // awaitable
    chain.returning = vi.fn().mockResolvedValue(result);
    return chain;
  };

  const makePendingRow = (overrides: Partial<PendingNotification> = {}): PendingNotification => ({
    id: 'pending-1',
    userId: 'user-1',
    type: 'reward_issued',
    title: '獎勵入帳',
    body: null,
    metadata: null,
    status: 'pending',
    attempts: 0,
    nextRetryAt: new Date(),
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    mockDb = {
      insert: vi.fn(),
      update: vi.fn(),
      select: vi.fn(),
    };
    mockMail = {
      sendNotificationEmail: vi.fn().mockResolvedValue(undefined),
      sendDailyDigestEmail: vi.fn().mockResolvedValue(undefined),
      sendRespondentThankYouEmail: vi.fn().mockResolvedValue(undefined),
    };

    mockDb.insert.mockReturnValue(makeChain());
    mockDb.update.mockReturnValue(makeChain());
    mockDb.select.mockReturnValue(makeChain());

    service = new NotificationsService(
      mockDb as unknown as AppDb,
      mockMail as never,
    );
  });

  // ─── create() ────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('inserts into pending_notifications then into notifications on success', async () => {
      const pendingRow = makePendingRow();

      let insertCount = 0;
      mockDb.insert.mockImplementation(() => {
        insertCount++;
        if (insertCount === 1) {
          // pending_notifications insert — returns the row via .returning()
          return makeChain([pendingRow]);
        }
        // notifications insert — values() resolves (no returning needed)
        return { values: vi.fn().mockResolvedValue([]) };
      });

      const updateChain = makeChain();
      mockDb.update.mockReturnValue(updateChain);

      await service.create({ userId: 'user-1', type: 'reward_issued', title: '獎勵入帳' });

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      // update marks status=done
      expect(mockDb.update).toHaveBeenCalledOnce();
      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(setArg?.status).toBe('done');
    });

    it('records retry schedule when notifications insert fails on first attempt', async () => {
      const pendingRow = makePendingRow({ attempts: 0 });

      let insertCount = 0;
      mockDb.insert.mockImplementation(() => {
        insertCount++;
        if (insertCount === 1) return makeChain([pendingRow]);
        // notifications insert fails
        return { values: vi.fn().mockRejectedValue(new Error('DB down')) };
      });

      const updateChain = makeChain();
      mockDb.update.mockReturnValue(updateChain);

      await service.create({ userId: 'user-1', type: 'reward_issued', title: '獎勵入帳' });

      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
      // attempts bumped to 1, still pending (no explicit status field means unchanged)
      expect(setArg?.attempts).toBe(1);
      expect(setArg?.lastError).toContain('DB down');
      expect(setArg?.status).toBeUndefined(); // keeps 'pending'
      expect(setArg?.nextRetryAt).toBeInstanceOf(Date);
    });
  });

  // ─── _processOne() ───────────────────────────────────────────────────────────

  describe('_processOne()', () => {
    it('marks status=failed after MAX_ATTEMPTS (3) exhausted', async () => {
      const exhaustedRow = makePendingRow({ attempts: 2 }); // 3rd attempt

      // notifications insert always fails
      mockDb.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error('DB error')) });

      const updateChain = makeChain();
      mockDb.update.mockReturnValue(updateChain);

      await service._processOne(exhaustedRow);

      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(setArg?.status).toBe('failed');
      expect(setArg?.attempts).toBe(3);
    });

    it('sets nextRetryAt ~5s ahead on 1st retry attempt', async () => {
      const row = makePendingRow({ attempts: 0 });

      mockDb.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error('err')) });

      const updateChain = makeChain();
      mockDb.update.mockReturnValue(updateChain);

      const before = Date.now();
      await service._processOne(row);
      const after = Date.now();

      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
      const retryAt = setArg?.nextRetryAt as Date;
      expect(retryAt.getTime()).toBeGreaterThanOrEqual(before + 5000);
      expect(retryAt.getTime()).toBeLessThanOrEqual(after + 5000 + 100);
    });

    it('sets nextRetryAt ~30s ahead on 2nd retry attempt', async () => {
      const row = makePendingRow({ attempts: 1 });

      mockDb.insert.mockReturnValue({ values: vi.fn().mockRejectedValue(new Error('err')) });

      const updateChain = makeChain();
      mockDb.update.mockReturnValue(updateChain);

      const before = Date.now();
      await service._processOne(row);

      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
      const retryAt = setArg?.nextRetryAt as Date;
      expect(retryAt.getTime()).toBeGreaterThanOrEqual(before + 30_000);
    });
  });

  // ─── retryPendingNotifications() ─────────────────────────────────────────────

  describe('retryPendingNotifications()', () => {
    it('processes overdue retry rows (attempts >= 1)', async () => {
      const retryRow = makePendingRow({ attempts: 1, nextRetryAt: new Date(Date.now() - 10_000) });

      const selectChain = makeChain([retryRow]);
      mockDb.select.mockReturnValue(selectChain);

      // notifications insert succeeds
      mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });

      const updateChain = makeChain();
      mockDb.update.mockReturnValue(updateChain);

      await service.retryPendingNotifications();

      expect(mockDb.insert).toHaveBeenCalledOnce();
      const setArg = (updateChain.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(setArg?.status).toBe('done');
    });

    it('does nothing when no pending rows', async () => {
      mockDb.select.mockReturnValue(makeChain([]));

      await service.retryPendingNotifications();

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});
