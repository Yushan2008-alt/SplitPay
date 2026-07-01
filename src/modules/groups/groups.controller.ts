// src/modules/groups/groups.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
import { GroupsService } from './groups.service.js';

@Controller('groups')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiTags('Groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /** POST /groups — Create group, auto-add host as HOST member */
  @Post()
  @ApiOperation({ summary: 'Create a new group', description: 'Host membuat grup baru dan otomatis ditambahkan sebagai anggota dengan role HOST.' })
  @ApiResponse({ status: 201, description: 'Grup berhasil dibuat' })
  async create(
    @Body() dto: CreateGroupDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.groupsService.createGroup(userId, dto);
  }

  /** GET /groups — List groups user belongs to (host or payer) */
  @Get()
  @ApiOperation({ summary: 'List user groups', description: 'Menampilkan semua grup yang diikuti user (sebagai host atau payer).' })
  @ApiResponse({ status: 200, description: 'Daftar grup user' })
  async findAll(@CurrentUser('sub') userId: string) {
    return this.groupsService.listMyGroups(userId);
  }

  /** GET /groups/:groupId — Full group detail with members + current period */
  @Get(':groupId')
  @ApiOperation({ summary: 'Get group detail', description: 'Detail grup lengkap dengan anggota dan periode billing aktif.' })
  @ApiResponse({ status: 200, description: 'Detail grup' })
  async findOne(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.groupsService.getGroupWithMembers(groupId, userId);
  }

  /** PATCH /groups/:groupId — Update (host only) */
  @Patch(':groupId')
  @ApiOperation({ summary: 'Update group', description: 'Host mengupdate grup. Hanya bisa ubah ke PAUSED atau CANCELLED.' })
  @ApiResponse({ status: 200, description: 'Grup berhasil diupdate' })
  async update(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.groupsService.updateGroup(groupId, userId, dto);
  }

  /** DELETE /groups/:groupId — Soft delete (host only) */
  @Delete(':groupId')
  @ApiOperation({ summary: 'Delete group', description: 'Host menghapus grup (soft delete). Diblokir jika ada periode billing aktif.' })
  @ApiResponse({ status: 200, description: 'Grup berhasil dihapus' })
  async remove(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.groupsService.deleteGroup(groupId, userId);
    return { message: 'Grup berhasil dihapus' };
  }
}
