import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupEntity } from '../../database/entities/index.js';

@Module({
  imports: [TypeOrmModule.forFeature([GroupEntity])],
})
export class GroupsModule {}
