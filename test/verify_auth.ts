import { Test } from '@nestjs/testing';
import { MinioService } from '../src/minio/minio.service';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import { KNEX_CONNECTION } from '../src/database/database.module';
import { RedisService } from '../src/redis/redis.service';
import { CustomExceptionFilter } from '../src/common/filters/custom-exception.filter';
import { ValidationPipe } from '@nestjs/common';

async function run() {
  console.log('--- Starting Auth Verification Test Suite ---');

  // Bootstrap app in-memory with mocked MinioService
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MinioService)
    .useValue({
      onModuleInit: () => Promise.resolve(),
      ensureBucketExists: () => Promise.resolve(),
      uploadFile: () => Promise.resolve('dummy-path'),
      getPresignedUrl: () => Promise.resolve('http://dummy-presigned-url'),
      deleteFile: () => Promise.resolve(),
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new CustomExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  await app.init();

  const server = app.getHttpServer();
  const knex = app.get(KNEX_CONNECTION);
  const redisService = app.get(RedisService);
  const redis = redisService.getClient();

  const phone = '998901112233';
  const formattedPhone = '+998 90 111-22-33';
  let employeeId: string | undefined = undefined;
  let userId: string | undefined = undefined;

  try {
    // 1. Cleanup old test data
    console.log('Cleaning up previous test data...');
    await knex('users').where('phone_number', phone).del();
    await knex('telegram_contacts').where('phone_number', phone).del();
    await knex('employees')
      .whereRaw("regexp_replace(phone, '[^0-9]', '', 'g') = ?", [phone])
      .del();
    await redis.del(`otp:register:${phone}`);
    await redis.del(`otp:reset:${phone}`);

    // Get or create department
    let department = await knex('departments').where('name', 'sales').first();
    if (!department) {
      const [newDept] = await knex('departments')
        .insert({ name: 'sales', display_name: 'Sales' })
        .returning('*');
      department = newDept;
    }

    // Insert test employee
    console.log('Inserting test employee...');
    const [employee] = await knex('employees')
      .insert({
        first_name: 'John',
        last_name: 'Doe',
        phone: formattedPhone,
        department_id: department.id,
        fixed_salary: 1000,
        color: '#ff0000',
        is_active: true,
      })
      .returning('*');
    employeeId = employee.id;

    // --- TEST 1: Login attempt on non-existent user ---
    console.log('\nTest 1: Login with non-existent user...');
    let res = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone_number: phone, password: 'password123' });

    assertErrorResponse(res, 401, 'invalid_login', 'UnauthorizedException');

    // --- TEST 2: Register send-otp without Telegram Registration ---
    console.log(
      '\nTest 2: Register send-otp without Telegram contact registered...',
    );
    res = await request(server)
      .post('/api/v1/auth/register/send-otp')
      .send({ phone_number: phone });

    assertErrorResponse(
      res,
      400,
      'telegram_not_registered',
      'BadRequestException',
    );

    // --- TEST 3: Register Telegram contact and retry Register Send-OTP ---
    console.log(
      '\nTest 3: Seed Telegram contact and retry register send-otp...',
    );
    await knex('telegram_contacts').insert({
      chat_id: '123456789',
      phone_number: phone,
      first_name: 'John',
    });

    res = await request(server)
      .post('/api/v1/auth/register/send-otp')
      .send({ phone_number: phone });

    assertEqual(res.status, 200, 'Register OTP send status');
    assertEqual(
      res.body.message,
      'OTP message sent successfully.',
      'Register OTP message',
    );

    // Verify user was pre-created in 'Pending' status
    const pendingUser = await knex('users')
      .where('phone_number', phone)
      .first();
    assert(!!pendingUser, 'Pending user created');
    assertEqual(pendingUser.status, 'Pending', 'Pending status');
    userId = pendingUser.id;

    // --- TEST 4: Register Verify OTP ---
    console.log('\nTest 4: Register Verify OTP...');
    const otp = await redis.get(`otp:register:${phone}`);
    assert(!!otp, 'OTP found in Redis');

    // Try invalid OTP
    res = await request(server)
      .post('/api/v1/auth/register/verify-otp')
      .send({ phone_number: phone, otp: '000000' });
    assertErrorResponse(res, 400, 'invalid_otp', 'BadRequestException');

    // Try valid OTP
    res = await request(server)
      .post('/api/v1/auth/register/verify-otp')
      .send({ phone_number: phone, otp });
    assertEqual(res.status, 200, 'Verify OTP status');
    const registerToken = res.body.token;
    assert(!!registerToken, 'Verify OTP returned register token');

    // --- TEST 5: Register Set Password ---
    console.log('\nTest 5: Register Set Password...');
    // Mismatched confirmation
    res = await request(server)
      .post('/api/v1/auth/register/set-password')
      .send({
        token: registerToken,
        password: 'password123',
        password_confirmation: 'different_password',
      });
    assertErrorResponse(
      res,
      400,
      'passwords_do_not_match',
      'BadRequestException',
    );

    // Invalid token
    res = await request(server)
      .post('/api/v1/auth/register/set-password')
      .send({
        token: 'invalid-token-uuid',
        password: 'password123',
        password_confirmation: 'password123',
      });
    assertErrorResponse(res, 400, 'invalid_token', 'BadRequestException');

    // Valid details
    res = await request(server)
      .post('/api/v1/auth/register/set-password')
      .send({
        token: registerToken,
        password: 'password123',
        password_confirmation: 'password123',
      });
    assertEqual(res.status, 200, 'Set Password status');

    // Check account status now
    const openUser = await knex('users').where('phone_number', phone).first();
    assertEqual(openUser.status, 'Open', 'User status should be Open');
    assert(!!openUser.password_hash, 'Password hash should be saved');

    // --- TEST 6: Login successfully ---
    console.log('\nTest 6: Login with correct password...');
    res = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone_number: phone, password: 'password123' });
    assertEqual(res.status, 200, 'Login status');
    assert(!!res.body.accessToken, 'Access token returned');
    assert(!!res.body.refreshToken, 'Refresh token returned');
    assertEqual(res.body.user.status, 'Open', 'User status in login payload');

    const originalAccessToken = res.body.accessToken;
    const originalRefreshToken = res.body.refreshToken;

    // --- TEST 6.1: Profile (employees/me and emloyees/me) Endpoints ---
    console.log(
      '\nTest 6.1: Profile endpoints (employees/me and emloyees/me)...',
    );

    // Call without token (should fail)
    let profileRes = await request(server).get('/api/v1/employees/me');
    assertErrorResponse(
      profileRes,
      401,
      'auth_header_missing',
      'UnauthorizedException',
    );

    // Call /employees/me with token
    profileRes = await request(server)
      .get('/api/v1/employees/me')
      .set('Authorization', `Bearer ${originalAccessToken}`);
    assertEqual(profileRes.status, 200, 'GET /employees/me status');
    assertEqual(
      profileRes.body.phone_number,
      phone,
      'GET /employees/me phone number',
    );
    assertEqual(
      profileRes.body.user_role,
      'EMPLOYEE',
      'GET /employees/me role',
    );
    assert(!!profileRes.body.employee, 'Employee relation loaded');
    assertEqual(
      profileRes.body.employee.first_name,
      'John',
      'Employee first name matches',
    );
    assertEqual(
      profileRes.body.employee.department.name,
      'sales',
      'Department relation loaded',
    );

    // Call /emloyees/me (typo route) with token
    profileRes = await request(server)
      .get('/api/v1/emloyees/me')
      .set('Authorization', `Bearer ${originalAccessToken}`);
    assertEqual(profileRes.status, 200, 'GET /emloyees/me status');
    assertEqual(
      profileRes.body.phone_number,
      phone,
      'GET /emloyees/me phone number',
    );

    // --- TEST 6.5: Refresh Token Flow ---
    console.log('\nTest 6.5: Refresh Token Flow...');

    // Verify token exists in Redis
    const storedTtl = await redis.ttl(
      `auth:refresh_token:${originalRefreshToken}`,
    );
    assert(
      storedTtl > 0 && storedTtl <= 2592000,
      `Refresh token TTL is set correctly in Redis: ${storedTtl} seconds`,
    );

    // Try refreshing with invalid token
    let refreshRes = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'invalid-refresh-token' });
    assertErrorResponse(
      refreshRes,
      401,
      'invalid_refresh_token',
      'UnauthorizedException',
    );

    // Refresh with valid token
    refreshRes = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    assertEqual(refreshRes.status, 200, 'Refresh status');
    assert(!!refreshRes.body.accessToken, 'New Access token returned');
    assert(!!refreshRes.body.refreshToken, 'New Refresh token returned');
    assert(
      refreshRes.body.accessToken !== originalAccessToken,
      'Access token has rotated',
    );
    assert(
      refreshRes.body.refreshToken !== originalRefreshToken,
      'Refresh token has rotated',
    );

    // Verify old refresh token is deleted from Redis (rotation check)
    const oldTokenExists = await redis.exists(
      `auth:refresh_token:${originalRefreshToken}`,
    );
    assertEqual(
      oldTokenExists,
      0,
      'Old refresh token was successfully deleted (rotated)',
    );

    // Verify new refresh token exists in Redis
    const newRefreshToken = refreshRes.body.refreshToken;
    const newTtl = await redis.ttl(`auth:refresh_token:${newRefreshToken}`);
    assert(
      newTtl > 0 && newTtl <= 2592000,
      `New refresh token TTL is set correctly in Redis: ${newTtl} seconds`,
    );

    // --- TEST 6.6: Logout Flow ---
    console.log('\nTest 6.6: Logout Flow...');
    // Try logout with invalid token
    let logoutRes = await request(server)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'invalid-refresh-token' });
    assertErrorResponse(
      logoutRes,
      401,
      'invalid_refresh_token',
      'UnauthorizedException',
    );

    // Logout with valid token
    logoutRes = await request(server)
      .post('/api/v1/auth/logout')
      .send({ refreshToken: newRefreshToken });
    assertEqual(logoutRes.status, 200, 'Logout status');
    assertEqual(
      logoutRes.body.message,
      'Logged out successfully',
      'Logout message',
    );

    // Verify token is deleted from Redis
    const tokenExistsAfterLogout = await redis.exists(
      `auth:refresh_token:${newRefreshToken}`,
    );
    assertEqual(
      tokenExistsAfterLogout,
      0,
      'Refresh token was successfully deleted on logout',
    );

    // Login with wrong password
    res = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone_number: phone, password: 'wrongpassword' });
    assertErrorResponse(res, 401, 'invalid_login', 'UnauthorizedException');

    // --- TEST 7: Login under special account statuses ---
    console.log('\nTest 7: Login under Banned and Deleted statuses...');
    // Banned
    await knex('users').where('id', userId).update({ status: 'Banned' });
    res = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone_number: phone, password: 'password123' });
    assertErrorResponse(res, 401, 'account_banned', 'UnauthorizedException');

    // Register should also reject banned accounts
    res = await request(server)
      .post('/api/v1/auth/register/send-otp')
      .send({ phone_number: phone });
    assertErrorResponse(res, 400, 'account_banned', 'BadRequestException');

    // Deleted
    await knex('users').where('id', userId).update({ status: 'Deleted' });
    res = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone_number: phone, password: 'password123' });
    assertErrorResponse(res, 401, 'account_deleted', 'UnauthorizedException');

    // Register should also reject deleted accounts
    res = await request(server)
      .post('/api/v1/auth/register/send-otp')
      .send({ phone_number: phone });
    assertErrorResponse(res, 400, 'account_deleted', 'BadRequestException');

    // Reset status to Open
    await knex('users').where('id', userId).update({ status: 'Open' });

    // --- TEST 8: Password Reset Flow ---
    console.log('\nTest 8: Password Reset Flow...');
    res = await request(server)
      .post('/api/v1/auth/password-reset/send-otp')
      .send({ phone_number: phone });
    assertEqual(res.status, 200, 'Reset OTP send status');

    const resetOtp = await redis.get(`otp:reset:${phone}`);
    assert(!!resetOtp, 'Reset OTP found in Redis');

    // Verify OTP
    res = await request(server)
      .post('/api/v1/auth/password-reset/verify-otp')
      .send({ phone_number: phone, otp: resetOtp });
    assertEqual(res.status, 200, 'Reset OTP verification status');
    const resetToken = res.body.token;
    assert(!!resetToken, 'Reset token generated');

    // Set new password
    res = await request(server)
      .post('/api/v1/auth/password-reset/set-password')
      .send({
        token: resetToken,
        password: 'newpassword123',
        password_confirmation: 'newpassword123',
      });
    assertEqual(res.status, 200, 'Reset Set Password status');

    // Try login with old password
    res = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone_number: phone, password: 'password123' });
    assertErrorResponse(res, 401, 'invalid_login', 'UnauthorizedException');

    // Login with new password
    res = await request(server)
      .post('/api/v1/auth/login')
      .send({ phone_number: phone, password: 'newpassword123' });
    assertEqual(res.status, 200, 'Login with new password status');

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! AUTH FLOW IS INCREDIBLE!');
  } catch (err) {
    console.error('\n❌ TEST FAILED WITH ERROR:', err);
    process.exit(1);
  } finally {
    // Cleanup test records
    console.log('\nCleaning up database records...');
    await knex('users').where('phone_number', phone).del();
    await knex('telegram_contacts').where('phone_number', phone).del();
    if (employeeId) {
      await knex('employees').where('id', employeeId).del();
    }

    await app.close();
    process.exit(0);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✓ ${message}`);
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message}. Expected [${expected}], got [${actual}]`,
    );
  }
  console.log(`✓ ${message}`);
}

function assertErrorResponse(
  res: any,
  status: number,
  location: string,
  errorName: string,
) {
  assertEqual(res.status, status, `Response status is ${status}`);
  assertEqual(
    res.body.location,
    location,
    `Response location is [${location}]`,
  );
  assertEqual(res.body.error, errorName, `Response error is [${errorName}]`);
  assert(
    typeof res.body.timestamp === 'string',
    'Response contains ISO timestamp',
  );
  assert(typeof res.body.path === 'string', 'Response contains request path');
  assert(
    typeof res.body.message === 'string',
    'Response contains error message string',
  );
  console.log(
    `✓ Error response matched criteria (status: ${status}, location: ${location}, error: ${errorName})`,
  );
}

run();
