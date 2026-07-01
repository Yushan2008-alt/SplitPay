// src/modules/groups/dto/update-group.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { GroupStatus } from '../../../database/entities/enums.js';
import { CreateGroupDto } from './create-group.dto.js';

/** Host hanya boleh pause atau cancel — tidak bisa ke ACTIVE via update */
const ALLOWED_STATUS = [GroupStatus.PAUSED, GroupStatus.CANCELLED] as const;
type AllowedStatus = (typeof ALLOWED_STATUS)[number];

export class UpdateGroupDto extends PartialType(CreateGroupDto) {
  @IsOptional()
  @IsEnum(ALLOWED_STATUS)
  status?: AllowedStatus;
}
