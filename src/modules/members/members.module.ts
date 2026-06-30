import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupMemberEntity } from '../../database/entities/index.js';

@Module({
  imports: [TypeOrmModule.forFeature([GroupMemberEntity])],
})
export class MembersModule {}
