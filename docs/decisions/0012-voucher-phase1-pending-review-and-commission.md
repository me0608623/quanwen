# ADR 0012: Voucher Phase 1 Pending Review and Commission

Date: 2026-05-29
Status: Accepted

## Context

QUA-44 requires Phase 1 voucher earning flow with:
- respondent reward on valid completion
- pending review gate for suspicious open-text responses
- platform commission tracking
- append-only ledger history

## Decision

1. Response gate:
- If anti-cheat score `>= 80`, mark response `rejected`.
- Else if any open-text answer length is `> 10`, mark response `pending_review`.
- Else mark response `submitted`.

2. Reward issuance:
- Only `submitted` responses trigger immediate reward issuance.
- `pending_review` responses do not issue reward until later manual/automated approval path.

3. Commission:
- Platform fee rate is `15%` (`PLATFORM_FEE_RATE = 0.15`).

4. Ledger model:
- Continue using append-only `transactions` + `journal_entries`.
- Map Phase 1 events to existing transaction types:
  - Earn: `reward_in`
  - Redeem: `withdraw_request`/`withdraw_complete`
  - Manual grant: `points_in` (admin/system grant path)
  - Reversal: `refund`

5. Balance API:
- Provide `GET /wallet/balance` with `cashBalance`, `pointsBalance`, and `lockedCash`.

## Consequences

- Reduces fraudulent auto-payout risk for low-effort long text responses.
- Keeps accounting audit trail in existing append-only model without introducing a new ledger table.
- Requires follow-up process for reviewing `pending_review` responses before payout.
