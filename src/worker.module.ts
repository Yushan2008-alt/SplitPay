// src/worker.module.ts
// NestJS module for the BullMQ worker process — no HTTP server.
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import appConfig from './config/app.config.js';
import databaseConfig from './config/database.config.js';
import redisConfig from './config/redis.config.js';
import jwtConfig from './config/jwt.config.js';
import mailConfig from './config/mail.config.js';
import { validationSchema } from './config/validation.schema.js';
import { CacheModule } from './modules/cache/cache.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { SchedulerModule } from './modules/scheduler/scheduler.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { AuthModule } from './modules/auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig, jwtConfig, mailConfig],
      validationSchema,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('database.url'),
        ssl: config.get<boolean>('database.ssl')
          ? { rejectUnauthorized: true }
          : false,
        autoLoadEntities: true,
        synchronize: false,
        logging: config.get<boolean>('database.logging'),
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('redis.url'),
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        },
      }),
    }),
    ScheduleModule.forRoot(),
    CacheModule,
    AuthModule,
    NotificationsModule,
    SchedulerModule,
    WebhooksModule,
  ],
})
export class WorkerModule {}
