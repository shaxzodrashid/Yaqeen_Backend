import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getMe(user.id);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register/send-otp')
  @HttpCode(HttpStatus.OK)
  async registerSendOtp(@Body() dto: SendOtpDto) {
    return this.authService.registerSendOtp(dto);
  }

  @Post('register/verify-otp')
  @HttpCode(HttpStatus.OK)
  async registerVerifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.registerVerifyOtp(dto);
  }

  @Post('register/set-password')
  @HttpCode(HttpStatus.OK)
  async registerSetPassword(@Body() dto: SetPasswordDto) {
    return this.authService.registerSetPassword(dto);
  }

  @Post('password-reset/send-otp')
  @HttpCode(HttpStatus.OK)
  async passwordResetSendOtp(@Body() dto: SendOtpDto) {
    return this.authService.resetPasswordSendOtp(dto);
  }

  @Post('password-reset/verify-otp')
  @HttpCode(HttpStatus.OK)
  async passwordResetVerifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.resetPasswordVerifyOtp(dto);
  }

  @Post('password-reset/set-password')
  @HttpCode(HttpStatus.OK)
  async passwordResetSetPassword(@Body() dto: SetPasswordDto) {
    return this.authService.resetPasswordSetPassword(dto);
  }
}
