// src/modules/members/members.controller.ts
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
import { AddMemberDto } from './dto/add-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { MembersService } from './members.service.js';

@Controller('groups/:groupId/members')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiTags('Members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  /** POST /groups/:groupId/members — Add member (host only) */
  @Post()
  @ApiOperation({ summary: 'Add member', description: 'Host menambahkan anggota ke grup. Maksimal 20 anggota.' })
  @ApiResponse({ status: 201, description: 'Anggota berhasil ditambahkan' })
  async addMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddMemberDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.membersService.addMember(groupId, userId, dto);
  }

  /** GET /groups/:groupId/members — List all active members */
  @Get()
  @ApiOperation({ summary: 'List members', description: 'Menampilkan semua anggota aktif dalam grup.' })
  @ApiResponse({ status: 200, description: 'Daftar anggota grup' })
  async listMembers(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.membersService.listMembers(groupId, userId);
  }

  /** PATCH /groups/:groupId/members/:memberId — Update (host or self for notif pref) */
  @Patch(':memberId')
  @ApiOperation({ summary: 'Update member', description: 'Host update share/status. Payer hanya bisa update notificationPreference.' })
  @ApiResponse({ status: 200, description: 'Anggota berhasil diupdate' })
  async updateMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.membersService.updateMember(groupId, memberId, userId, dto);
  }

  /** DELETE /groups/:groupId/members/:memberId — Remove (host only, not self) */
  @Delete(':memberId')
  @ApiOperation({ summary: 'Remove member', description: 'Host menghapus anggota dari grup. Host tidak bisa menghapus diri sendiri.' })
  @ApiResponse({ status: 200, description: 'Anggota berhasil dihapus' })
  async removeMember(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser('sub') userId: string,
  ) {
    await this.membersService.removeMember(groupId, memberId, userId);
    return { message: 'Anggota berhasil dihapus dari grup' };
  }
}
