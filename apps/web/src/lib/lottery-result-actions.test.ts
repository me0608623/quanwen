import { describe, expect, it } from 'vitest';
import { lotteryWinnerActions } from './lottery-result-actions';

describe('lotteryWinnerActions', () => {
  it('lets an overdue winner report missing instructions without confirming receipt', () => {
    expect(lotteryWinnerActions({
      fulfillmentStatus: 'pending',
      recipientStatus: 'awaiting_delivery',
      fulfillmentDueAt: '2026-06-01T00:00:00.000Z',
    }, new Date('2026-06-09T00:00:00.000Z').getTime())).toEqual({
      fulfillmentOverdue: true,
      canConfirm: false,
      canReport: true,
    });
  });

  it('does not allow follow-up after the winner confirms receipt', () => {
    expect(lotteryWinnerActions({
      fulfillmentStatus: 'notified',
      recipientStatus: 'received',
      fulfillmentDueAt: '2026-06-01T00:00:00.000Z',
    }, new Date('2026-06-09T00:00:00.000Z').getTime())).toEqual({
      fulfillmentOverdue: true,
      canConfirm: false,
      canReport: false,
    });
  });

  const NOW = new Date('2026-06-05T00:00:00.000Z').getTime();

  it('lets a notified winner confirm receipt before the due date', () => {
    const r = lotteryWinnerActions({
      fulfillmentStatus: 'notified',
      recipientStatus: 'awaiting_delivery',
      fulfillmentDueAt: '2026-06-10T00:00:00.000Z',
    }, NOW);
    expect(r).toEqual({ fulfillmentOverdue: false, canConfirm: true, canReport: true });
  });

  it('is not overdue once the platform has verified fulfillment', () => {
    const r = lotteryWinnerActions({
      fulfillmentStatus: 'notified',
      recipientStatus: 'received',
      fulfillmentDueAt: '2026-06-01T00:00:00.000Z',
      platformVerifiedAt: '2026-06-02T00:00:00.000Z',
    }, NOW);
    expect(r.fulfillmentOverdue).toBe(false);
  });

  it('is not overdue when the due date is in the future or absent', () => {
    expect(lotteryWinnerActions({
      fulfillmentStatus: 'pending', recipientStatus: 'awaiting_delivery',
      fulfillmentDueAt: '2026-06-20T00:00:00.000Z',
    }, NOW).fulfillmentOverdue).toBe(false);
    expect(lotteryWinnerActions({
      fulfillmentStatus: 'pending', recipientStatus: 'awaiting_delivery',
      fulfillmentDueAt: null,
    }, NOW).fulfillmentOverdue).toBe(false);
  });

  it('does not let a pending (not overdue) winner report yet', () => {
    const r = lotteryWinnerActions({
      fulfillmentStatus: 'pending',
      recipientStatus: 'awaiting_delivery',
      fulfillmentDueAt: '2026-06-20T00:00:00.000Z',
    }, NOW);
    expect(r).toEqual({ fulfillmentOverdue: false, canConfirm: false, canReport: false });
  });
});
