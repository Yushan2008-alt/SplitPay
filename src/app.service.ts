import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type Redis from 'ioredis';

// ponytail: single redis check — cache shares the same REDIS_CLIENT
export interface HealthResult {
  status: 'ok' | 'degraded' | 'unhealthy';
  database: 'connected' | 'disconnected';
  redis: 'connected' | 'disconnected';
  timestamp: string;
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getHealth(): Promise<HealthResult> {
    let dbStatus: HealthResult['database'] = 'disconnected';
    let redisStatus: HealthResult['redis'] = 'disconnected';

    try {
      await this.dataSource.query('SELECT 1');
      dbStatus = 'connected';
    } catch (err) {
      this.logger.warn(`Health check — DB: ${(err as Error).message}`);
    }

    try {
      await this.redis.ping();
      redisStatus = 'connected';
    } catch (err) {
      this.logger.warn(`Health check — Redis: ${(err as Error).message}`);
    }

    const allOk = dbStatus === 'connected' && redisStatus === 'connected';
    const anyOk = dbStatus === 'connected' || redisStatus === 'connected';

    return {
      status: allOk ? 'ok' : anyOk ? 'degraded' : 'unhealthy',
      database: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
