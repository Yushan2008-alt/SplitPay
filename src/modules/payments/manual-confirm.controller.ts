import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe.js';
import { PaymentsService } from './payments.service.js';

@Controller('billing-periods')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiTags('Payments')
export class ManualConfirmController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':periodId/members/:memberId/confirm-manual')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Member self-report payment',
  })
  async confirmManual(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.paymentsService.confirmManual(periodId, memberId, userId);
  }
}
