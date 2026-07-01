import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
@ApiBearerAuth('access-token')
@ApiTags('Auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('debug-header')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[DEV] Debug request headers' })
  debugHeader(@Req() req: Request): { authorization: string; allHeaders: Record<string, string> } {
    const headers = req.headers;
    const authHeader = headers['authorization'];
    this.logger.log('=== DEBUG HEADERS ===');
    this.logger.log(`Authorization: ${authHeader ?? '(none)'}`);
    this.logger.log(`All headers: ${JSON.stringify(headers, null, 2)}`);
    this.logger.log('=== END DEBUG ===');
    return {
      authorization: authHeader ?? '(none)',
      allHeaders: Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(', ') : String(v),
        ]),
      ),
    };
  }

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 30_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new user with email' })
  @ApiResponse({ status: 201, description: 'Registrasi berhasil, OTP dikirim' })
  @ApiBadRequestResponse({
    description: 'Email sudah terdaftar / input tidak valid',
  })
  @ApiTooManyRequestsResponse({ description: 'Terlalu banyak permintaan' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip, req.headers['user-agent']);
  }

  @Post('send-otp')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 30_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP verification email' })
  @ApiResponse({ status: 200, description: 'OTP berhasil dikirim' })
  @ApiBadRequestResponse({ description: 'Cooldown OTP / input tidak valid' })
  @ApiNotFoundResponse({ description: 'Email tidak terdaftar' })
  @ApiTooManyRequestsResponse({ description: 'Terlalu banyak permintaan' })
  async sendOtp(@Body() dto: SendOtpDto, @Req() req: Request) {
    return this.authService.sendOtp(dto, req.ip, req.headers['user-agent']);
  }

  @Post('verify-otp')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 30_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and receive JWT tokens' })
  @ApiResponse({
    status: 200,
    description: 'OTP valid, token JWT dikembalikan',
  })
  @ApiBadRequestResponse({
    description: 'OTP tidak valid / kadaluarsa / terlalu banyak percobaan',
  })
  @ApiNotFoundResponse({ description: 'Email tidak terdaftar' })
  @ApiTooManyRequestsResponse({ description: 'Terlalu banyak permintaan' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyOtp(dto, req.ip);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 30_000 } })
  @UseGuards(AuthGuard('jwt-refresh'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Token baru berhasil dibuat' })
  @ApiUnauthorizedResponse({
    description: 'Refresh token tidak valid / telah dinonaktifkan',
  })
  @ApiTooManyRequestsResponse({ description: 'Terlalu banyak permintaan' })
  async refresh(@Body() _dto: RefreshTokenDto, @Req() req: Request) {
    const user = req.user as JwtPayload & { refreshToken: string };
    return this.authService.refreshToken(user.refreshToken, user, req.ip);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and blacklist current token' })
  @ApiResponse({ status: 200, description: 'Berhasil logout' })
  @ApiUnauthorizedResponse({ description: 'Belum terautentikasi' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body() _dto: LogoutDto,
    @Req() req: Request,
  ) {
    return this.authService.logout(_dto.refreshToken, user, req.ip);
  }

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Data profil pengguna' })
  @ApiUnauthorizedResponse({ description: 'Belum terautentikasi' })
  @ApiNotFoundResponse({ description: 'Pengguna tidak ditemukan' })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profil berhasil diperbarui' })
  @ApiBadRequestResponse({ description: 'Input tidak valid' })
  @ApiUnauthorizedResponse({ description: 'Belum terautentikasi' })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }
}
