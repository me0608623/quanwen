export interface LotteryWinnerActionInput {
  fulfillmentStatus: string;
  recipientStatus: string;
  fulfillmentDueAt?: string | null;
  platformVerifiedAt?: string | null;
}

export function lotteryWinnerActions(winning: LotteryWinnerActionInput, now = Date.now()) {
  const fulfillmentOverdue = !!winning.fulfillmentDueAt
    && !winning.platformVerifiedAt
    && new Date(winning.fulfillmentDueAt).getTime() < now;
  const canConfirm = winning.fulfillmentStatus === 'notified' && winning.recipientStatus !== 'received';
  const canReport = winning.recipientStatus === 'awaiting_delivery'
    && (winning.fulfillmentStatus === 'notified' || fulfillmentOverdue);

  return { fulfillmentOverdue, canConfirm, canReport };
}
