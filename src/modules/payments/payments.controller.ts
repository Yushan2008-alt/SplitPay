import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe.js';
import { PaymentStatus } from '../../database/entities/enums.js';
import { PaymentsService } from './payments.service.js';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto.js';
import { ManualMarkPaidDto } from './dto/manual-mark-paid.dto.js';

@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiTags('Payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ─── CONFIRM PAYMENT (PUBLIC SIGNED URL) ──────────────────────────────────

  @Post('confirm')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm payment via signed URL token',
    description:
      'Public endpoint untuk konfirmasi pembayaran via link di email. ' +
      'Token harus valid, belum expired, dan belum digunakan.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pembayaran berhasil dikonfirmasi',
  })
  @ApiBadRequestResponse({
    description: 'Token tidak valid / expired / sudah digunakan',
  })
  @ApiNotFoundResponse({ description: 'Payment record tidak ditemukan' })
  async confirmPayment(@Body() dto: ConfirmPaymentDto) {
    return this.paymentsService.confirmPayment(dto.token);
  }

  /**
   * Alternative: Confirm via query param (untuk redirect dari email link).
   * Redirect ke frontend setelah sukses/error.
   */
  @Get('confirm')
  @Public()
  @ApiOperation({
    summary: 'Confirm payment via GET (redirect from email)',
    description: 'Endpoint untuk link email, redirect ke frontend setelah proses.',
  })
  async confirmPaymentViaGet(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const frontendUrl =
      process.env.FRONTEND_URL?.split(',')[0] ?? 'http://localhost:3000';

    const TOKEN_FORMAT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
    if (!token || !TOKEN_FORMAT.test(token)) {
      return res.redirect(
        HttpStatus.FOUND,
        `${frontendUrl}/payment/error?reason=${!token ? 'missing_token' : 'invalid_token'}`,
      );
    }

    try {
      await this.paymentsService.confirmPayment(token);
      return res.redirect(HttpStatus.FOUND, `${frontendUrl}/payment/success`);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'unknown_error';
      return res.redirect(
        HttpStatus.FOUND,
        `${frontendUrl}/payment/error?reason=${encodeURIComponent(reason)}`,
      );
    }
  }

  // ─── HOST MANUAL ACTIONS ──────────────────────────────────────────────────

  @Patch('records/:recordId/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[HOST] Manually mark a payment record as PAID',
    description: 'Host secara manual menandai pembayaran member sebagai lunas.',
  })
  @ApiResponse({ status: 200, description: 'Payment record berhasil diupdate' })
  @ApiForbiddenResponse({ description: 'Hanya host yang bisa mark paid' })
  @ApiNotFoundResponse({ description: 'Payment record tidak ditemukan' })
  async hostMarkPaid(
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @CurrentUser('sub') hostUserId: string,
    @Body() dto: ManualMarkPaidDto,
  ) {
    return this.paymentsService.hostMarkPaid(recordId, hostUserId, dto);
  }

  @Patch('records/:recordId/waive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[HOST] Waive a payment record',
    description:
      'Host membebaskan member dari kewajiban pembayaran (e.g., member keluar).',
  })
  @ApiResponse({ status: 200, description: 'Payment record berhasil di-waive' })
  @ApiForbiddenResponse({ description: 'Hanya host yang bisa waive payment' })
  @ApiNotFoundResponse({ description: 'Payment record tidak ditemukan' })
  async waivePayment(
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @CurrentUser('sub') hostUserId: string,
  ) {
    return this.paymentsService.waivePayment(recordId, hostUserId);
  }

  // ─── GATEWAY PAYMENT LINK ──────────────────────────────────────────────────

  @Post('records/:recordId/gateway-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create payment gateway link',
    description:
      'Membuat link pembayaran via Midtrans/Xendit. ' +
      'Hanya untuk payment record dengan status PENDING.',
  })
  @ApiResponse({ status: 200, description: 'Gateway link berhasil dibuat' })
  @ApiForbiddenResponse({ description: 'Bukan host atau pemilik record ini' })
  @ApiNotFoundResponse({ description: 'Payment record tidak ditemukan' })
  async createGatewayLink(
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.paymentsService.createGatewayPaymentLink(recordId, userId);
  }

  // ─── PERIOD HISTORY ───────────────────────────────────────────────────────

  @Get('groups/:groupId/periods')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all periods for a group',
    description:
      'Tampilkan semua periode billing untuk grup (member hanya lihat record sendiri).',
  })
  @ApiResponse({ status: 200, description: 'Daftar periode dengan payment record' })
  @ApiForbiddenResponse({ description: 'Bukan member grup ini' })
  @ApiNotFoundResponse({ description: 'Grup tidak ditemukan' })
  async listPeriods(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.paymentsService.getPeriods(groupId, userId);
  }

  @Get('groups/:groupId/periods/:periodId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get period detail with payment records',
    description:
      'Host: lihat semua payment records. Payer: hanya lihat payment record sendiri.',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail periode dengan payment records (filtered by role)',
  })
  @ApiForbiddenResponse({ description: 'Bukan member grup ini' })
  @ApiNotFoundResponse({ description: 'Periode tidak ditemukan' })
  async getPeriodDetail(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.paymentsService.getPeriodDetail(groupId, periodId, userId);
  }

  @Patch(':paymentId/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[HOST] Review manual payment confirmation',
    description: 'Approve or reject payment in pending host review status.',
  })
  async reviewPayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser('sub') hostUserId: string,
    @Body('action') action: 'approve' | 'reject',
  ) {
    return this.paymentsService.reviewPayment(paymentId, hostUserId, action);
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Payment history with filtering',
  })
  async getHistory(
    @CurrentUser('sub') userId: string,
    @Query('status') status?: PaymentStatus,
    @Query('groupId') groupId?: string,
  ) {
    return this.paymentsService.getPaymentHistory(userId, status, groupId);
  }
}
