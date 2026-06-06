# 0014 Lottery Platform Guarantee And Prize Delivery

Date: 2026-06-03

## Decision

QuanWen supports lottery rewards as a creator-funded prize workflow. The platform acts as the process guarantor and evidence custodian, not as the default prize provider.

The official fulfillment channel is the in-app system notification. Survey creators must send redemption instructions through the platform after the lottery is drawn. The instruction can contain a unique digital voucher code, redemption URL, pickup process, customer-service contact, or shipping/contact collection instructions. The platform stores the instruction, notification delivery marker, recipient confirmation, issue report, admin intervention history, and final verification.

## Scope

The lottery lifecycle has these stages:

1. Setup: the creator chooses lottery mode, prize, winner count, draw rule, and accepts lottery fulfillment terms.
2. Eligibility: only audited valid responses from deliverable user accounts enter the candidate pool.
3. Draw: the platform records the candidate digest, random seed, participant results, winners, and notification markers.
4. Creator obligation: after draw, the creator receives a system obligation notice and must send prize fulfillment instructions within seven days.
5. Prize delivery: the creator sends instructions through the platform. For multiple winners, each winner can receive a different instruction or voucher code.
6. Recipient confirmation: the winner confirms receipt or reports a problem from the task lottery page.
7. Platform guarantee: admins review overdue or disputed cases, notify both parties, append intervention records, and verify fulfillment only after the winner confirms receipt.

## Delivery Channels

The platform notification is the official delivery record. The actual prize handoff can use:

- Digital code: put a unique voucher, ticket code, serial number, or redemption URL in the per-winner instruction.
- Pickup: describe venue, valid date, identity check method, and contact window.
- Shipping: ask the winner to provide delivery information through the specified support process; avoid exposing personal data in public survey content.
- Third-party claim: provide a vendor claim link or support ticket process.
- Manual service: provide support contact steps when the prize requires scheduling.

Bulk fulfillment is allowed only when the same instruction is valid for every pending winner. Unique vouchers should use per-winner fulfillment.

## Platform Evidence

The platform must keep:

- Creator lottery terms acceptance time.
- Draw time, draw seed, eligible candidate digest, winner count, and replayable audit proof.
- Participant draw-notification delivery markers.
- Creator obligation notification marker.
- Winner fulfillment instruction, fulfillment time, and delivery marker.
- Winner receipt confirmation or issue report.
- Platform intervention notes and history.
- Platform verification time, admin, note, and verification notification marker.

## Enforcement Rules

- Lottery draw is blocked until quality review/manual review has finished.
- A closed survey can draw from existing eligible participants.
- Repeated or concurrent draw attempts must not create duplicate result rows or notifications.
- A creator cannot fulfill before draw.
- A winner cannot confirm receipt before fulfillment instructions are sent.
- A winner can report if instructions are overdue, or if instructions were sent but the prize was not received.
- Admin verification requires winner receipt confirmation.
- Admin intervention is allowed after winner issue report or after fulfillment deadline.
- Accepted lottery participation evidence cannot be rewritten after draw; disputes move to platform intervention.

## Product Copy Positioning

Use this wording consistently:

> 平台是抽獎流程保障人：保存建立者承諾、開獎公平性證明、通知送達、兌獎說明、收件確認與爭議處理紀錄。獎品由問卷建立者負責提供；平台不預設代替建立者出獎品。

## Current Implementation

- API: `SurveyLotteryService.draw`, `fulfill`, `fulfillWinner`, `confirmReceipt`, `reportIssue`.
- Admin: `AdminService.getLotteryObligations`, `verifyLotteryFulfillment`, `interveneLotteryIssue`.
- UI: survey stats lottery panel, respondent task lottery tab, admin lottery dashboard.
- Tests: `survey-lottery.integration.test.ts`, `admin-lottery.integration.test.ts`, response quality/appeal lottery tests.
