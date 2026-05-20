import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { DB } from '../db';
import type { AppDb } from '../db';
import { interestTags } from '../db/schema';
import { SEED_TAGS } from './tags.seed';

@Injectable()
export class TagsService implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: AppDb) {}

  async onModuleInit() {
    // 啟動時確保預設標籤存在
    await this.db
      .insert(interestTags)
      .values(SEED_TAGS.map((t) => ({ name: t.name, category: t.category, sortOrder: t.sortOrder })))
      .onConflictDoNothing();
  }

  async findAll() {
    return this.db
      .select()
      .from(interestTags)
      .orderBy(interestTags.sortOrder);
  }
}
