import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { AuthService } from './auth.service.js';
import { LogoutDto } from './dto/logout.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { SendOtpDto } from './dto/send-otp.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

@Controller('auth')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 30_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new user with email' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('send-otp')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 30_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP verification email' })
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Post('verify-otp')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 30_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and receive JWT tokens' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 30_000 } })
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(
    @Body() _dto: RefreshTokenDto,
    @Req() req: Request,
  ) {
    const user = req.user as JwtPayload & { refreshToken: string };
    return this.authService.refreshToken(user.refreshToken, user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and blacklist current token' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body() _dto: LogoutDto,
  ) {
    return this.authService.logout(_dto.refreshToken, user);
  }

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current user profile' })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }
}
