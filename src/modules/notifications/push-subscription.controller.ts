import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { PushSubscriptionService } from './push-subscription.service.js';
import { SubscribePushDto, UnsubscribePushDto } from './dto/push-subscription.dto.js';

@Controller('push')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@ApiTags('Push Notifications')
export class PushSubscriptionController {
  constructor(
    private readonly pushSubscriptionService: PushSubscriptionService,
  ) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Subscribe to push notifications',
    description:
      'Register device for web push notifications. Upserts by endpoint ' +
      '(if already exists, updates keys).',
  })
  @ApiResponse({
    status: 201,
    description: 'Successfully subscribed to push notifications',
  })
  @ApiBadRequestResponse({ description: 'Invalid subscription data' })
  async subscribe(
    @CurrentUser('sub') userId: string,
    @Body() dto: SubscribePushDto,
  ) {
    return this.pushSubscriptionService.subscribe(userId, dto);
  }

  @Delete('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unsubscribe from push notifications',
    description: 'Remove push subscription for current device.',
  })
  @ApiResponse({ status: 204, description: 'Successfully unsubscribed' })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  @ApiForbiddenResponse({ description: 'Not your subscription' })
  async unsubscribe(
    @CurrentUser('sub') userId: string,
    @Body() dto: UnsubscribePushDto,
  ) {
    await this.pushSubscriptionService.unsubscribe(userId, dto.endpoint);
  }

  @Get('subscriptions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all push subscriptions',
    description: 'List all active push subscriptions for current user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of push subscriptions',
  })
  async getSubscriptions(@CurrentUser('sub') userId: string) {
    return this.pushSubscriptionService.getUserSubscriptions(userId);
  }
}
