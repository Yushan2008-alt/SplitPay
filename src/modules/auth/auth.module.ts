import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { OtpCodeEntity, RefreshTokenEntity } from '../../database/entities/index.js';
import { OtpCodeRepository } from '../../database/repositories/index.js';
import { GroupsModule } from '../groups/groups.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MailService } from './mail.service.js';
import { RedisService } from './redis.service.js';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),
        signOptions: {
          // ponytail: @nestjs/jwt v11 uses StringValue branded type — plain `string` won't compile
expiresIn: (config.get<string>('jwt.accessExpiresIn') ?? '15m') as any,
        },
      }),
    }),
    TypeOrmModule.forFeature([OtpCodeEntity, RefreshTokenEntity]),
    UsersModule,
    GroupsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MailService,
    RedisService,
    OtpCodeRepository,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('redis.url')),
      inject: [ConfigService],
    },
    JwtStrategy,
    JwtRefreshStrategy,
  ],
  exports: [AuthService, RedisService, 'REDIS_CLIENT'],
})
export class AuthModule {}
