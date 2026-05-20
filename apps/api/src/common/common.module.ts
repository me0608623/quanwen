import { Module, Global } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CommonModule {}
