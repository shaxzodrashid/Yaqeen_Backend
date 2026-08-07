import { Test } from '@nestjs/testing';
import { MinioService } from '../src/minio/minio.service';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import { KNEX_CONNECTION } from '../src/database/database.module';
import { RedisService } from '../src/redis/redis.service';
import { CustomExceptionFilter } from '../src/common/filters/custom-exception.filter';
import { ValidationPipe } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import * as bcrypt from 'bcryptjs';

async function run() {
  console.log('=== Starting JWT Middleware Stress Test ===');

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
  await app.listen(0);

  const server = app.getHttpServer();
  const knex = app.get(KNEX_CONNECTION);
  const redisService = app.get(RedisService);
  const redis = redisService.getClient();
  const authService = app.get(AuthService);

  const phone = '998998887766';
  const formattedPhone = '+998 99 888-77-66';
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
    let department = await knex('departments').where('name', 'hr').first();
    if (!department) {
      const [newDept] = await knex('departments')
        .insert({ name: 'hr', display_name: 'HR' })
        .returning('*');
      department = newDept;
    }

    // Insert test employee
    console.log('Inserting test employee...');
    const [employee] = await knex('employees')
      .insert({
        first_name: 'Stress',
        last_name: 'Tester',
        phone: formattedPhone,
        department_id: department.id,
        fixed_salary: 1500,
        color: '#00ff00',
        is_active: true,
      })
      .returning('*');
    employeeId = employee.id;

    // Create Telegram contact
    await knex('telegram_contacts').insert({
      chat_id: '987654321',
      phone_number: phone,
      first_name: 'Stress',
    });

    // Create user in Open status
    console.log('Creating active user...');
    const passwordHash = await bcrypt.hash('password123', 10);
    const [user] = await knex('users')
      .insert({
        employee_id: employee.id,
        phone_number: phone,
        username: phone,
        password_hash: passwordHash,
        role: 'EMPLOYEE',
        status: 'Open',
        is_active: true,
      })
      .returning('*');
    userId = user.id;

    // Generate fresh JWT token
    console.log('Generating fresh token via AuthService...');
    const loginResult = await authService.login({
      phone_number: phone,
      password: 'password123',
    });
    const token = loginResult.accessToken;
    console.log(`Successfully generated token: ${token.substring(0, 15)}...`);

    // Warm-up request
    console.log('Executing warm-up request...');
    const warmUpRes = await request(server)
      .get('/api/v1/employees/me')
      .set('Authorization', `Bearer ${token}`);
    if (warmUpRes.status !== 200) {
      throw new Error(
        `Warm-up request failed with status ${warmUpRes.status}: ${JSON.stringify(warmUpRes.body)}`,
      );
    }
    console.log('✓ Warm-up request succeeded!');

    // CONCURRENCY STRESS TEST
    const totalRequests = 1000;
    const batchSize = 100;
    console.log(
      `\nStarting Stress Test: sending ${totalRequests} total requests in batches of ${batchSize}...`,
    );

    const startTime = Date.now();
    let successCount = 0;
    let failureCount = 0;
    const errors: any[] = [];

    for (let i = 0; i < totalRequests; i += batchSize) {
      const currentBatchSize = Math.min(batchSize, totalRequests - i);
      const batchPromises = Array.from(
        { length: currentBatchSize },
        async (_, index) => {
          const reqNum = i + index + 1;
          try {
            const res = await request(server)
              .get('/api/v1/employees/me')
              .set('Authorization', `Bearer ${token}`);

            if (res.status === 200) {
              successCount++;
            } else {
              failureCount++;
              errors.push({ reqNum, status: res.status, body: res.body });
            }
          } catch (err: any) {
            failureCount++;
            errors.push({ reqNum, error: err.message });
          }
        },
      );

      await Promise.all(batchPromises);
      console.log(
        `Sent ${Math.min(i + batchSize, totalRequests)} / ${totalRequests} requests...`,
      );
    }

    const duration = Date.now() - startTime;
    const rps = (totalRequests / (duration / 1000)).toFixed(2);

    console.log('\n=== Stress Test Results ===');
    console.log(`Total Requests:  ${totalRequests}`);
    console.log(
      `Success Rate:    ${((successCount / totalRequests) * 100).toFixed(2)}% (${successCount} passed)`,
    );
    console.log(
      `Failure Rate:    ${((failureCount / totalRequests) * 100).toFixed(2)}% (${failureCount} failed)`,
    );
    console.log(`Total Duration:  ${duration}ms`);
    console.log(`Throughput:      ${rps} req/sec`);

    if (errors.length > 0) {
      console.error('\nFirst 5 errors encountered:');
      console.error(JSON.stringify(errors.slice(0, 5), null, 2));
      throw new Error(`Stress test failed with ${errors.length} errors.`);
    }

    console.log('\n🎉 STRESS TEST PASSED SUCCESSFULLY with 100% success rate!');
  } catch (err) {
    console.error('\n❌ STRESS TEST ENCOUNTERED AN ERROR:', err);
    process.exit(1);
  } finally {
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

run();
