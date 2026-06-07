/**
 * 整合測試:企業品牌問卷優惠券發放與優惠券夾列表。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';
import type { AppDb } from '../db';
import { FULL_SCHEMA_DDL } from '../test-helpers/pglite-ddl';
import { CouponsService } from './coupons.service';

const RESPONDENT = '11111111-1111-1111-1111-111111111111';
const SURVEYOR = '22222222-2222-2222-2222-222222222222';
const SURVEY = '33333333-3333-3333-3333-333333333333';
const RESPONSE = '44444444-4444-4444-4444-444444444444';

describe('CouponsService (integration)', () => {
  let client: PGlite;
  let db: AppDb;
  let service: CouponsService;

  beforeEach(async () => {
    client = new PGlite();
    await client.exec(FULL_SCHEMA_DDL);
    db = drizzle(client, { schema }) as unknown as AppDb;
    service = new CouponsService(db);
    await client.exec(`
      INSERT INTO users (id, email, role, display_name) VALUES
        ('${RESPONDENT}', 'r@example.com', 'respondent', 'R'),
        ('${SURVEYOR}', 's@example.com', 'surveyor', 'S');
      INSERT INTO surveys (id, surveyor_id, title, is_brand_survey, coupon_brand, coupon_title, coupon_code)
        VALUES ('${SURVEY}', '${SURVEYOR}', '品牌問卷', true, '星巴克', '買一送一券', 'SBX2026');
    `);
  });

  const issue = () =>
    service.issueForResponse({
      userId: RESPONDENT,
      surveyId: SURVEY,
      responseId: RESPONSE,
      brandName: '星巴克',
      title: '買一送一券',
      code: 'SBX2026',
      expiresAt: null,
    });

  it('發券後 listForUser 看得到', async () => {
    await issue();
    const coupons = await service.listForUser(RESPONDENT);
    expect(coupons).toHaveLength(1);
    expect(coupons[0].title).toBe('買一送一券');
    expect(coupons[0].brandName).toBe('星巴克');
    expect(coupons[0].code).toBe('SBX2026');
    expect(coupons[0].status).toBe('active');
  });

  it('同一 responseId 重複發券 → 冪等(只有一張)', async () => {
    await issue();
    await issue();
    const coupons = await service.listForUser(RESPONDENT);
    expect(coupons).toHaveLength(1);
  });

  it('別人的券看不到', async () => {
    await issue();
    const coupons = await service.listForUser(SURVEYOR);
    expect(coupons).toHaveLength(0);
  });
});
