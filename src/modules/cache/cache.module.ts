import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service.js';
import { AuthModule } from '../auth/auth.module.js';

// ponytail: reuses REDIS_CLIENT from AuthModule instead of opening a second connection to the same instance
@Global()
@Module({
  imports: [AuthModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
