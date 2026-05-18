import { Module } from '@nestjs/common';
import { ZaiClient } from './zai.client';

@Module({
  providers: [ZaiClient],
  exports: [ZaiClient],
})
export class AiAuditModule {}
