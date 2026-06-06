/**
 * 開發環境種子資料 — 只在連接真實 PostgreSQL 時使用
 * 執行：pnpm db:seed
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import {
  users,
  surveys,
  surveyQuestions,
  questionOptions,
  mutualPairs,
  respondentProfiles,
  surveyorProfiles,
  pointShopItems,
} from './schema';
import { VOUCHER_CATALOG } from './shop-catalog-seed';
import * as bcrypt from 'bcryptjs';

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set — seed only runs against real PostgreSQL');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, {
    schema: { users, surveys, surveyQuestions, questionOptions, mutualPairs },
  });

  console.log('🌱 Seeding...');
  const passwordHash = await bcrypt.hash('000', 12);

  await db
    .insert(users)
    .values([
      { email: 'user@quanwen.com',  passwordHash, displayName: '平台管理員', role: 'admin',      emailVerified: true },
      { email: 'user1@quanwen.com', passwordHash, displayName: '測試用戶 1', role: 'surveyor',   emailVerified: true },
      { email: 'user2@quanwen.com', passwordHash, displayName: '測試用戶 2', role: 'respondent', emailVerified: true },
    ])
    .onConflictDoNothing();

  // 拿 user1 / user2 的 id 回來建 mutual demo 問卷
  const userRows = await db
    .select({ id: users.id, email: users.email })
    .from(users);
  const u1 = userRows.find((u) => u.email === 'user1@quanwen.com');
  const u2 = userRows.find((u) => u.email === 'user2@quanwen.com');

  // Phase A: 給所有 user 都建好兩種 profile（isOnboardingDone=true，跳過 onboarding 牆）
  for (const u of userRows) {
    await db
      .insert(respondentProfiles)
      .values({ userId: u.id, isOnboardingDone: true })
      .onConflictDoNothing();
    await db
      .insert(surveyorProfiles)
      .values({ userId: u.id, isOnboardingDone: true })
      .onConflictDoNothing();
  }

  if (u1 && u2) {
    // ── Demo mutual surveys（fresh DB 時建立；已存在則略過）──
    const exists1 = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.title, 'DEMO 互惠：你最近最常用的 APP'))
      .limit(1);
    const exists2 = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(eq(surveys.title, 'DEMO 互惠：你假日喜歡做什麼'))
      .limit(1);

    if (exists1.length === 0 && exists2.length === 0) {
      console.log('🤝 Seeding mutual demo surveys...');

      const [s1] = await db
        .insert(surveys)
        .values({
          surveyorId: u1.id,
          title: 'DEMO 互惠：你最近最常用的 APP',
          description: '想了解大家手機上花最多時間的 APP 類別，互惠模式：你填我我填你。',
          type: 'mutual',
          status: 'published',
          publishedAt: new Date(),
          rewardPoints: 0,
          targetCount: 9999,
        })
        .returning({ id: surveys.id });

      const [s2] = await db
        .insert(surveys)
        .values({
          surveyorId: u2.id,
          title: 'DEMO 互惠：你假日喜歡做什麼',
          description: '輕鬆 3 題，想知道大家假日怎麼放鬆。回填我之後可以看你的答案。',
          type: 'mutual',
          status: 'published',
          publishedAt: new Date(),
          rewardPoints: 0,
          targetCount: 9999,
        })
        .returning({ id: surveys.id });

      // s1 題目
      const [q1] = await db
        .insert(surveyQuestions)
        .values({
          surveyId: s1.id,
          type: 'single_choice',
          title: '最近一個月你最常用的 APP 類別？',
          sortOrder: 0,
          isRequired: true,
        })
        .returning({ id: surveyQuestions.id });
      await db.insert(questionOptions).values([
        { questionId: q1.id, label: '社群（IG / Threads / X）', sortOrder: 0 },
        { questionId: q1.id, label: '影音（YouTube / TikTok）', sortOrder: 1 },
        { questionId: q1.id, label: '購物（蝦皮 / Momo / PChome）', sortOrder: 2 },
        { questionId: q1.id, label: '工具（地圖、翻譯、生產力）', sortOrder: 3 },
      ]);

      await db.insert(surveyQuestions).values({
        surveyId: s1.id,
        type: 'text',
        title: '為什麼是這個類別？',
        sortOrder: 1,
        isRequired: false,
      });

      // s2 題目
      const [q21] = await db
        .insert(surveyQuestions)
        .values({
          surveyId: s2.id,
          type: 'single_choice',
          title: '你假日通常會？',
          sortOrder: 0,
          isRequired: true,
        })
        .returning({ id: surveyQuestions.id });
      await db.insert(questionOptions).values([
        { questionId: q21.id, label: '宅在家追劇', sortOrder: 0 },
        { questionId: q21.id, label: '出門走走 / 旅行', sortOrder: 1 },
        { questionId: q21.id, label: '運動 / 戶外活動', sortOrder: 2 },
        { questionId: q21.id, label: '和朋友 / 家人聚餐', sortOrder: 3 },
      ]);

      await db.insert(surveyQuestions).values({
        surveyId: s2.id,
        type: 'rating',
        title: '整體來說你假日的滿意度？',
        sortOrder: 1,
        isRequired: true,
        config: { maxRating: 5 },
      });

      // 兩份都丟進 waiting 池 — cron 起來會自動配對 user1 ↔ user2
      await db
        .insert(mutualPairs)
        .values([
          { aUserId: u1.id, aSurveyId: s1.id, status: 'waiting' },
          { aUserId: u2.id, aSurveyId: s2.id, status: 'waiting' },
        ])
        .onConflictDoNothing();

      console.log('✅ Mutual demo seed done — cron 會在 30s 內自動配對');
    } else {
      console.log('🤝 Mutual demo surveys 已存在，跳過');
    }

    // ── Demo standard surveys 讓 /tasks 不會空 ──
    const standardDemos: Array<{ surveyorId: string; title: string; description: string; category: 'consumer' | 'wellness' | 'tech' | 'lifestyle' }> = [
      { surveyorId: u1.id, title: 'DEMO 標準:你最近一次外送是?',  description: '消費者外送習慣調查,1 題。', category: 'consumer' },
      { surveyorId: u1.id, title: 'DEMO 標準:你的運動頻率',      description: '每週運動次數調查,1 題。',  category: 'wellness' },
      { surveyorId: u2.id, title: 'DEMO 標準:手機品牌偏好',      description: '消費電子產品調查,1 題。',  category: 'tech'     },
    ];
    for (const demo of standardDemos) {
      const existing = await db.select({ id: surveys.id }).from(surveys).where(eq(surveys.title, demo.title)).limit(1);
      if (existing.length > 0) continue;
      const [survey] = await db.insert(surveys).values({
        surveyorId: demo.surveyorId,
        title: demo.title,
        description: demo.description,
        type: 'standard',
        category: demo.category,
        status: 'published',
        publishedAt: new Date(),
        rewardPoints: 30,
        targetCount: 50,
      }).returning({ id: surveys.id });
      await db.insert(surveyQuestions).values({
        surveyId: survey.id,
        type: 'text',
        title: '為什麼?',
        sortOrder: 0,
        isRequired: false,
      });
    }
    console.log('✅ Standard demo surveys 已上架/已存在');
  }

  // ─── 積分商城：便利商店禮券雛形 ─────────────────────────────────────────────
  const existingItems = await db.select({ id: pointShopItems.id }).from(pointShopItems).limit(1);
  if (existingItems.length === 0) {
    await db.insert(pointShopItems).values(VOUCHER_CATALOG);
    console.log(`🛒 Seeded ${VOUCHER_CATALOG.length} 便利商店禮券商品`);
  } else {
    console.log('🛒 商城商品已存在，跳過');
  }

  console.log('✅ Done');
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
