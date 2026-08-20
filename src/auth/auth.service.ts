import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { RedisService } from '../redis/redis.service';
import { TelegramBotService } from './telegram-bot.service';
import { LoginDto } from './dto/login.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

interface TelegramContact {
  id?: string;
  phone_number: string;
  telegram_id?: string;
  username?: string;
  created_at?: Date | string;
}

interface UserRow {
  id: string;
  employee_id?: string | null;
  phone_number: string;
  username: string;
  password_hash: string;
  role: string;
  role_id?: string | null;
  status: string;
  is_active?: boolean | number | null;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  role_name?: string | null;
  role_display_name?: string | null;
  role_description?: string | null;
  role_permissions?: Record<string, Record<string, boolean>> | string | null;
  role_is_system?: boolean | number | null;
}

interface EmployeeRow {
  id: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
}

interface RefreshTokenPayload {
  userId: string;
  phone_number: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly redisService: RedisService,
    private readonly telegramBotService: TelegramBotService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Helper to normalize a phone number (leaves only digits).
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  /**
   * Helper to verify if the phone is registered in the Telegram Bot.
   */
  private async checkTelegramRegistration(phone: string): Promise<void> {
    const contact = await this.knex<TelegramContact>('telegram_contacts')
      .where('phone_number', phone)
      .first();

    if (!contact) {
      const botUsername = this.telegramBotService.getBotUsername();
      const botUrl = this.telegramBotService.getBotUrl(phone);
      throw new BadRequestException({
        message: 'Phone number is not registered in the Telegram bot.',
        location: 'telegram_not_registered',
        telegram_bot_username: botUsername,
        telegram_bot_url: botUrl,
      });
    }
  }

  /**
   * Check if a phone number is registered in Telegram bot and return bot URL.
   */
  async checkTelegramStatus(phoneNumber: string) {
    if (!phoneNumber) {
      throw new BadRequestException({
        message: 'Phone number is required.',
        location: 'validation_failed',
      });
    }

    const phone = this.normalizePhone(phoneNumber);
    const contact = await this.knex<TelegramContact>('telegram_contacts')
      .where('phone_number', phone)
      .first();

    const botUsername = this.telegramBotService.getBotUsername();
    const botUrl = this.telegramBotService.getBotUrl(phone);

    return {
      registered: Boolean(contact),
      phone_number: phone,
      telegram_bot_username: botUsername,
      telegram_bot_url: botUrl,
    };
  }

  /**
   * Helper to normalize user permissions across all system modules.
   */
  public getUserPermissions(user: Partial<UserRow>) {
    const systemModules = [
      {
        module: 'clients',
        actions: [
          'create',
          'read',
          'update',
          'delete',
          'can_work_with_all_clients',
        ],
      },
      { module: 'employees', actions: ['create', 'read', 'update', 'delete'] },
      {
        module: 'departments',
        actions: ['create', 'read', 'update', 'delete'],
      },
      { module: 'cargo_kpi', actions: ['create', 'read', 'update', 'delete'] },
      {
        module: 'cargo_registrations',
        actions: [
          'create',
          'read',
          'update',
          'delete',
          'register_for_everyone',
        ],
      },
      { module: 'finance', actions: ['create', 'read', 'update', 'delete'] },
      {
        module: 'commercial_offers',
        actions: ['create', 'read', 'update', 'delete'],
      },
      { module: 'tasks', actions: ['create', 'read', 'update', 'delete'] },
      { module: 'currency', actions: ['create', 'read', 'update', 'delete'] },
      {
        module: 'attachments',
        actions: ['create', 'read', 'update', 'delete'],
      },
      { module: 'roles', actions: ['create', 'read', 'update', 'delete'] },
    ];

    const rawPermissions = user.role_permissions;
    let parsedPermissions: Record<string, Record<string, boolean>> = {};
    if (typeof rawPermissions === 'string') {
      try {
        parsedPermissions = JSON.parse(rawPermissions) as Record<
          string,
          Record<string, boolean>
        >;
      } catch {
        parsedPermissions = {};
      }
    } else if (rawPermissions && typeof rawPermissions === 'object') {
      parsedPermissions = rawPermissions;
    }

    const effectiveRole = user.role_name || user.role;
    const isCeoOrRop =
      user.role === 'CEO' ||
      user.role === 'ROP' ||
      effectiveRole === 'CEO' ||
      effectiveRole === 'ROP';

    const permissions: Record<string, Record<string, boolean>> = {};

    for (const item of systemModules) {
      const mod = item.module;
      const rawMod: Record<string, boolean> = parsedPermissions[mod] || {};
      const isCeo = user.role === 'CEO' || effectiveRole === 'CEO';

      permissions[mod] = {
        create: isCeo ? true : Boolean(rawMod.create),
        read: isCeo ? true : Boolean(rawMod.read),
        update: isCeo ? true : Boolean(rawMod.update),
        delete: isCeo ? true : Boolean(rawMod.delete),
      };

      if (item.actions.includes('register_for_everyone')) {
        permissions[mod].register_for_everyone = isCeoOrRop
          ? true
          : Boolean(rawMod.register_for_everyone);
      }

      if (item.actions.includes('can_work_with_all_clients')) {
        permissions[mod].can_work_with_all_clients = isCeoOrRop
          ? true
          : Boolean(rawMod.can_work_with_all_clients);
      }
    }

    return permissions;
  }

  /**
   * Get user profile details & permissions for current session ("Get me").
   */
  async getMe(userId: string) {
    const user = (await this.knex<UserRow>('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select(
        'u.id',
        'u.phone_number',
        'u.username',
        'u.role',
        'u.role_id',
        'u.status',
        'u.is_active',
        'u.created_at',
        'u.updated_at',
        'r.name as role_name',
        'r.display_name as role_display_name',
        'r.description as role_description',
        'r.permissions as role_permissions',
        'r.is_system as role_is_system',
      )
      .where('u.id', userId)
      .first()) as UserRow | undefined;

    if (!user) {
      throw new UnauthorizedException({
        message: 'User account not found',
        location: 'user_not_found',
      });
    }

    if (!user.role_permissions && user.role) {
      const fallbackRole = (await this.knex('roles')
        .whereRaw('LOWER(name) = ?', [user.role.toLowerCase()])
        .first()) as
        | {
            id: string;
            name: string;
            display_name: string | null;
            description: string | null;
            permissions:
              Record<string, Record<string, boolean>> | string | null;
            is_system: boolean | null;
          }
        | undefined;
      if (fallbackRole) {
        user.role_name = fallbackRole.name;
        user.role_display_name = fallbackRole.display_name;
        user.role_description = fallbackRole.description;
        user.role_permissions = fallbackRole.permissions;
        user.role_is_system = fallbackRole.is_system;
        user.role_id = fallbackRole.id;
      }
    }

    const permissions = this.getUserPermissions(user);
    const roleName = user.role_name || user.role;

    return {
      id: user.id,
      phone_number: user.phone_number,
      username: user.username,
      role: roleName,
      role_id: user.role_id,
      status: user.status,
      is_active: !!user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
      role_details: user.role_id
        ? {
            id: user.role_id,
            name: roleName,
            display_name: user.role_display_name || roleName,
            description: user.role_description,
            is_system: !!user.role_is_system,
            permissions: permissions,
          }
        : null,
      permissions: permissions,
    };
  }

  /**
   * Login endpoint logic.
   */
  async login(dto: LoginDto) {
    const phone = this.normalizePhone(dto.phone_number);

    // Look up user with role
    const user = (await this.knex<UserRow>('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select(
        'u.*',
        'r.name as role_name',
        'r.display_name as role_display_name',
        'r.description as role_description',
        'r.permissions as role_permissions',
        'r.is_system as role_is_system',
      )
      .where('u.phone_number', phone)
      .first()) as UserRow | undefined;

    if (!user) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        location: 'invalid_login',
      });
    }

    // Check account status
    if (user.status === 'Banned') {
      throw new UnauthorizedException({
        message: 'Account has been banned',
        location: 'account_banned',
      });
    }

    if (user.status === 'Deleted') {
      throw new UnauthorizedException({
        message: 'Account has been deleted',
        location: 'account_deleted',
      });
    }

    if (user.status === 'Pending') {
      throw new UnauthorizedException({
        message: 'Account registration has not been completed',
        location: 'account_pending',
      });
    }

    // Verify password
    if (!user.password_hash) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        location: 'invalid_login',
      });
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        message: 'Invalid credentials',
        location: 'invalid_login',
      });
    }

    if (!user.role_permissions && user.role) {
      const fallbackRole = (await this.knex('roles')
        .whereRaw('LOWER(name) = ?', [user.role.toLowerCase()])
        .first()) as
        | {
            id: string;
            name: string;
            display_name: string | null;
            description: string | null;
            permissions:
              Record<string, Record<string, boolean>> | string | null;
            is_system: boolean | null;
          }
        | undefined;
      if (fallbackRole) {
        user.role_name = fallbackRole.name;
        user.role_display_name = fallbackRole.display_name;
        user.role_description = fallbackRole.description;
        user.role_permissions = fallbackRole.permissions;
        user.role_is_system = fallbackRole.is_system;
        user.role_id = fallbackRole.id;
      }
    }

    const activeRoleName = user.role_name || user.role;

    // Generate JWT
    const payload = {
      sub: user.id,
      phone_number: user.phone_number,
      role: activeRoleName,
      jti: crypto.randomUUID(),
    };

    const secret =
      this.configService.get<string>('jwtSecret') ||
      'super_secret_key_change_me_in_production';
    const expiresIn = this.configService.get<string>('jwtExpiresIn') || '1d';
    const token = jwt.sign(payload, secret, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    });

    // Generate Refresh Token
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const refreshExpiresIn =
      this.configService.get<string>('refreshTokenExpiresIn') || '30m';
    const refreshTtlSeconds = this.parseDurationToSeconds(refreshExpiresIn);

    // Store in Redis mapping token to user details
    const redisKey = `auth:refresh_token:${refreshToken}`;
    const tokenData = JSON.stringify({
      userId: user.id,
      phone_number: user.phone_number,
      role: activeRoleName,
    });
    await this.redisService.set(redisKey, tokenData, refreshTtlSeconds);

    const permissions = this.getUserPermissions(user);

    return {
      accessToken: token,
      refreshToken: refreshToken,
      user: {
        id: user.id,
        phone_number: user.phone_number,
        role: activeRoleName,
        role_id: user.role_id,
        status: user.status,
        role_details: user.role_id
          ? {
              id: user.role_id,
              name: activeRoleName,
              display_name: user.role_display_name || activeRoleName,
              description: user.role_description,
              is_system: !!user.role_is_system,
              permissions: permissions,
            }
          : null,
        permissions: permissions,
      },
    };
  }

  /**
   * Registration Stage 1: Send OTP.
   */
  async registerSendOtp(dto: SendOtpDto) {
    const phone = this.normalizePhone(dto.phone_number);

    // 1. Verify Telegram registration
    await this.checkTelegramRegistration(phone);

    // 2. Query user account
    let user = await this.knex<UserRow>('users')
      .where('phone_number', phone)
      .first();

    // 3. Fallback: If user account does not exist, check if an employee exists with this phone number
    if (!user) {
      const employee = await this.knex<EmployeeRow>('employees')
        .whereRaw("regexp_replace(phone, '[^0-9]', '', 'g') = ?", [phone])
        .first();

      if (!employee) {
        throw new BadRequestException({
          message:
            'No associated employee account found with this phone number.',
          location: 'account_not_found',
        });
      }

      // Create a pending user account mapped to this employee
      const [newUser] = await this.knex<UserRow>('users')
        .insert({
          employee_id: employee.id,
          phone_number: phone,
          username: phone, // default username to phone
          password_hash: '', // no password yet
          role: 'EMPLOYEE', // default role
          status: 'Pending',
        })
        .returning('*');

      user = newUser;
    } else if (!user.employee_id) {
      const employee = await this.knex<EmployeeRow>('employees')
        .whereRaw("regexp_replace(phone, '[^0-9]', '', 'g') = ?", [phone])
        .first();

      if (employee) {
        await this.knex('users').where('id', user.id).update({
          employee_id: employee.id,
          updated_at: this.knex.fn.now(),
        });
        user.employee_id = employee.id;
      }
    }

    // 4. Validate user status
    if (user.status === 'Open') {
      throw new BadRequestException({
        message: 'Account is already registered.',
        location: 'already_registered',
      });
    }

    if (user.status === 'Banned') {
      throw new BadRequestException({
        message: 'Account has been banned.',
        location: 'account_banned',
      });
    }

    if (user.status === 'Deleted') {
      throw new BadRequestException({
        message: 'Account has been deleted.',
        location: 'account_deleted',
      });
    }

    // 5. Generate OTP (6-digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 6. Save in Redis with 5 min (300 seconds) TTL
    await this.redisService.set(`otp:register:${phone}`, otp, 300);

    // 7. Send OTP via Telegram
    const sent = await this.telegramBotService.sendOtp(phone, otp);

    // Always log OTP to console as fallback for development testing
    this.logger.log(
      `[Registration OTP] Phone: +${phone} | OTP: ${otp} | Sent to Telegram: ${sent}`,
    );

    return {
      message: 'OTP message sent successfully.',
    };
  }

  /**
   * Registration Stage 2: Verify OTP.
   */
  async registerVerifyOtp(dto: VerifyOtpDto) {
    const phone = this.normalizePhone(dto.phone_number);

    // 1. Get OTP from Redis
    const cachedOtp = await this.redisService.get(`otp:register:${phone}`);
    if (!cachedOtp || cachedOtp !== dto.otp) {
      throw new BadRequestException({
        message: 'Invalid or expired OTP code.',
        location: 'invalid_otp',
      });
    }

    // 2. Clean OTP from Redis
    await this.redisService.del(`otp:register:${phone}`);

    // 3. Generate a temporary registration token
    const token = crypto.randomUUID();

    // 4. Save token in Redis with 10 min (600 seconds) TTL
    await this.redisService.set(`token:register:${token}`, phone, 600);

    return {
      token,
    };
  }

  /**
   * Registration Stage 3: Set Password.
   */
  async registerSetPassword(dto: SetPasswordDto) {
    // 1. Confirm passwords match
    if (dto.password !== dto.password_confirmation) {
      throw new BadRequestException({
        message: 'Password confirmation does not match.',
        location: 'passwords_do_not_match',
      });
    }

    // 2. Validate token from Redis
    const phone = await this.redisService.get(`token:register:${dto.token}`);
    if (!phone) {
      throw new BadRequestException({
        message: 'Invalid or expired temporary registration token.',
        location: 'invalid_token',
      });
    }

    // 3. Find pending user
    const user = await this.knex<UserRow>('users')
      .where('phone_number', phone)
      .first();
    if (!user) {
      throw new BadRequestException({
        message: 'Account not found.',
        location: 'account_not_found',
      });
    }

    if (user.status !== 'Pending') {
      throw new BadRequestException({
        message: 'Account is not in Pending status.',
        location: 'already_registered',
      });
    }

    // 4. Hash password and update status to Open
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.knex('users').where('id', user.id).update({
      password_hash: passwordHash,
      status: 'Open',
      is_active: true,
      updated_at: this.knex.fn.now(),
    });

    // 5. Clean up the temp token
    await this.redisService.del(`token:register:${dto.token}`);

    return {
      message:
        'Registration completed successfully. Your account is now active.',
    };
  }

  /**
   * Password Update Stage 1: Send OTP.
   */
  async resetPasswordSendOtp(dto: SendOtpDto) {
    const phone = this.normalizePhone(dto.phone_number);

    // 1. Verify Telegram registration
    await this.checkTelegramRegistration(phone);

    // 2. Look up user account
    const user = await this.knex<UserRow>('users')
      .where('phone_number', phone)
      .first();
    if (!user) {
      throw new BadRequestException({
        message: 'No account found with this phone number.',
        location: 'account_not_found',
      });
    }

    // 3. Verify status
    if (user.status === 'Pending') {
      throw new BadRequestException({
        message: 'Account has not been registered yet.',
        location: 'account_pending',
      });
    }

    if (user.status === 'Banned') {
      throw new BadRequestException({
        message: 'Account has been banned.',
        location: 'account_banned',
      });
    }

    if (user.status === 'Deleted') {
      throw new BadRequestException({
        message: 'Account has been deleted.',
        location: 'account_deleted',
      });
    }

    // 4. Generate OTP (6-digits)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 5. Save in Redis with 5 min (300 seconds) TTL
    await this.redisService.set(`otp:reset:${phone}`, otp, 300);

    // 6. Send OTP via Telegram
    const sent = await this.telegramBotService.sendOtp(phone, otp);

    // Always log OTP to console as fallback for development testing
    this.logger.log(
      `[Password Reset OTP] Phone: +${phone} | OTP: ${otp} | Sent to Telegram: ${sent}`,
    );

    return {
      message: 'OTP message sent successfully.',
    };
  }

  /**
   * Password Update Stage 2: Verify OTP.
   */
  async resetPasswordVerifyOtp(dto: VerifyOtpDto) {
    const phone = this.normalizePhone(dto.phone_number);

    // 1. Get OTP from Redis
    const cachedOtp = await this.redisService.get(`otp:reset:${phone}`);
    if (!cachedOtp || cachedOtp !== dto.otp) {
      throw new BadRequestException({
        message: 'Invalid or expired OTP code.',
        location: 'invalid_otp',
      });
    }

    // 2. Clean OTP from Redis
    await this.redisService.del(`otp:reset:${phone}`);

    // 3. Generate a temporary password reset token
    const token = crypto.randomUUID();

    // 4. Save token in Redis with 10 min (600 seconds) TTL
    await this.redisService.set(`token:reset:${token}`, phone, 600);

    return {
      token,
    };
  }

  /**
   * Password Update Stage 3: Set Password.
   */
  async resetPasswordSetPassword(dto: SetPasswordDto) {
    // 1. Confirm passwords match
    if (dto.password !== dto.password_confirmation) {
      throw new BadRequestException({
        message: 'Password confirmation does not match.',
        location: 'passwords_do_not_match',
      });
    }

    // 2. Validate token from Redis
    const phone = await this.redisService.get(`token:reset:${dto.token}`);
    if (!phone) {
      throw new BadRequestException({
        message: 'Invalid or expired temporary password reset token.',
        location: 'invalid_token',
      });
    }

    // 3. Find user
    const user = await this.knex<UserRow>('users')
      .where('phone_number', phone)
      .first();
    if (!user) {
      throw new BadRequestException({
        message: 'Account not found.',
        location: 'account_not_found',
      });
    }

    if (user.status === 'Banned') {
      throw new BadRequestException({
        message: 'Account has been banned.',
        location: 'account_banned',
      });
    }

    if (user.status === 'Deleted') {
      throw new BadRequestException({
        message: 'Account has been deleted.',
        location: 'account_deleted',
      });
    }

    if (user.status === 'Pending') {
      throw new BadRequestException({
        message: 'Account registration has not been completed.',
        location: 'account_pending',
      });
    }

    // 4. Hash password and update database
    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.knex('users').where('id', user.id).update({
      password_hash: passwordHash,
      updated_at: this.knex.fn.now(),
    });

    // 5. Clean up the temp token
    await this.redisService.del(`token:reset:${dto.token}`);

    return {
      message:
        'Password reset successfully. You can now login with your new password.',
    };
  }

  /**
   * Helper to parse duration strings (e.g., '30m', '1d', '3600s') into seconds.
   */
  private parseDurationToSeconds(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      const num = parseInt(duration, 10);
      return isNaN(num) ? 1800 : num;
    }
    const val = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's':
        return val;
      case 'm':
        return val * 60;
      case 'h':
        return val * 3600;
      case 'd':
        return val * 86400;
      default:
        return 1800;
    }
  }

  /**
   * Refresh Access Token and rotate Refresh Token.
   */
  async refresh(dto: RefreshTokenDto) {
    const redisKey = `auth:refresh_token:${dto.refreshToken}`;

    // 1. Retrieve refresh token data from Redis
    const dataStr = await this.redisService.get(redisKey);
    if (!dataStr) {
      throw new UnauthorizedException({
        message: 'Invalid or expired refresh token',
        location: 'invalid_refresh_token',
      });
    }

    const payload = JSON.parse(dataStr) as RefreshTokenPayload;

    // 2. Query user from database to ensure status is still Open
    const user = await this.knex<UserRow>('users')
      .where('id', payload.userId)
      .first();
    if (!user) {
      throw new UnauthorizedException({
        message: 'User associated with token not found',
        location: 'user_not_found',
      });
    }

    if (user.status === 'Banned') {
      throw new UnauthorizedException({
        message: 'Account has been banned',
        location: 'account_banned',
      });
    }

    if (user.status === 'Deleted') {
      throw new UnauthorizedException({
        message: 'Account has been deleted',
        location: 'account_deleted',
      });
    }

    if (user.status === 'Pending') {
      throw new UnauthorizedException({
        message: 'Account registration has not been completed',
        location: 'account_pending',
      });
    }

    // 3. Delete the old refresh token (rotation)
    await this.redisService.del(redisKey);

    // 4. Generate new Access Token
    const jwtPayload = {
      sub: user.id,
      phone_number: user.phone_number,
      role: user.role,
      jti: crypto.randomUUID(),
    };
    const secret =
      this.configService.get<string>('jwtSecret') ||
      'super_secret_key_change_me_in_production';
    const expiresIn = this.configService.get<string>('jwtExpiresIn') || '1d';
    const newAccessToken = jwt.sign(jwtPayload, secret, {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    });

    // 5. Generate new Refresh Token
    const newRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshExpiresIn =
      this.configService.get<string>('refreshTokenExpiresIn') || '30m';
    const refreshTtlSeconds = this.parseDurationToSeconds(refreshExpiresIn);

    // Store new refresh token in Redis
    const newRedisKey = `auth:refresh_token:${newRefreshToken}`;
    const tokenData = JSON.stringify({
      userId: user.id,
      phone_number: user.phone_number,
      role: user.role,
    });
    await this.redisService.set(newRedisKey, tokenData, refreshTtlSeconds);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Invalidate a Refresh Token (Logout).
   */
  async logout(dto: LogoutDto) {
    const redisKey = `auth:refresh_token:${dto.refreshToken}`;

    // 1. Retrieve refresh token data from Redis to ensure it is valid
    const dataStr = await this.redisService.get(redisKey);
    if (!dataStr) {
      throw new UnauthorizedException({
        message: 'Invalid or expired refresh token',
        location: 'invalid_refresh_token',
      });
    }

    // 2. Delete it from Redis
    await this.redisService.del(redisKey);

    return {
      message: 'Logged out successfully',
    };
  }
}
