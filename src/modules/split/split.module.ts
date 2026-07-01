// src/modules/split/split.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  GroupEntity,
  GroupMemberEntity,
} from '../../database/entities/index.js';
import { SplitCalculationService } from './split-calculation.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([GroupEntity, GroupMemberEntity])],
  providers: [SplitCalculationService],
  exports: [SplitCalculationService],
})
export class SplitModule {}
