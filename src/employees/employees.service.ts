import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { MinioService } from '../minio/minio.service';
import { RedisService } from '../redis/redis.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import * as crypto from 'crypto';

@Injectable()
export class EmployeesService implements OnModuleInit {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly minioService: MinioService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    try {
      const hasColumn = await this.knex.schema.hasColumn(
        'employees',
        'picture_url',
      );
      if (!hasColumn) {
        await this.knex.schema.table('employees', (table) => {
          table.text('picture_url');
        });
        this.logger.log(
          'Successfully ensured picture_url column on employees table.',
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to verify picture_url column on employees table: ${err}`,
      );
    }
  }

  /**
   * Helper to normalize a phone number (leaves only digits).
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  /**
   * Helper to format currency numbers cleanly (e.g. "4,400,000 ₽" or "4,400,000 UZS").
   */
  private formatCurrency(amount: number, currency: string = 'UZS'): string {
    const rounded = Math.round(amount);
    const formattedNumber = new Intl.NumberFormat('en-US').format(rounded);
    const currUpper = (currency || 'UZS').toUpperCase();

    switch (currUpper) {
      case 'RUB':
      case 'RUBLE':
        return `${formattedNumber} ₽`;
      case 'USD':
        return `$${formattedNumber}`;
      case 'EUR':
        return `€${formattedNumber}`;
      case 'UZS':
      default:
        return `${formattedNumber} ${currUpper}`;
    }
  }

  /**
   * Batch fetches clients count, tushum (revenue), and reja/fakt (plan targets)
   * for an array of employee IDs using parallel batch queries for maximum performance.
   */
  private async getEmployeesMetricsMap(employeeIds: string[]) {
    const validIds = (employeeIds || []).filter(Boolean);
    if (!validIds.length) {
      return new Map<
        string,
        { tushum: any; reja_fakt: any; mijozlar_count: number }
      >();
    }

    const [clientCounts, cargoSales, salesManagerEvals, plans] =
      await Promise.all([
        // 1. Mijozlar count per assigned employee
        this.knex('clients')
          .whereIn('assigned_employee_id', validIds)
          .select('assigned_employee_id as employee_id')
          .count('id as count')
          .groupBy('assigned_employee_id'),

        // 2. Cargo transactions total revenue per employee
        this.knex('cargo_transactions')
          .whereIn('employee_id', validIds)
          .select('employee_id')
          .sum('sell_price as total_sales')
          .groupBy('employee_id'),

        // 3. Sales manager evaluations (plan/revenue source)
        this.knex.schema
          .hasTable('sales_manager_evaluations')
          .then(async (hasTable) => {
            if (!hasTable) return [];
            return this.knex('sales_manager_evaluations')
              .whereIn('employee_id', validIds)
              .select(
                'employee_id',
                'total_sales',
                'plan_target_max',
                'is_plan_achieved',
              )
              .orderBy('created_at', 'desc');
          }),

        // 4. Employee plans
        this.knex.schema.hasTable('employee_plans').then(async (hasTable) => {
          if (!hasTable) return [];
          return this.knex('employee_plans')
            .whereIn('employee_id', validIds)
            .select('employee_id', 'target_amount', 'currency')
            .orderBy('created_at', 'desc');
        }),
      ]);

    const clientCountMap = new Map<string, number>();
    for (const c of clientCounts) {
      clientCountMap.set(
        String(c.employee_id),
        parseInt(String(c.count || '0'), 10),
      );
    }

    const revenueMap = new Map<string, number>();
    for (const cs of cargoSales) {
      const empId = String(cs.employee_id);
      const current = revenueMap.get(empId) || 0;
      revenueMap.set(
        empId,
        current + parseFloat(String(cs.total_sales || '0')),
      );
    }

    const evalPlanMap = new Map<string, { plan: number }>();
    for (const sm of salesManagerEvals) {
      const empId = String(sm.employee_id);
      if (!revenueMap.has(empId) && sm.total_sales) {
        revenueMap.set(empId, parseFloat(String(sm.total_sales)));
      }
      if (!evalPlanMap.has(empId) && sm.plan_target_max) {
        evalPlanMap.set(empId, {
          plan: parseFloat(String(sm.plan_target_max)),
        });
      }
    }

    const planMap = new Map<
      string,
      { target_amount: number; currency: string }
    >();
    for (const p of plans) {
      const empId = String(p.employee_id);
      if (!planMap.has(empId)) {
        planMap.set(empId, {
          target_amount: parseFloat(String(p.target_amount || '0')),
          currency: String(p.currency || 'UZS'),
        });
      }
    }

    const metricsMap = new Map<
      string,
      { tushum: any; reja_fakt: any; mijozlar_count: number }
    >();

    for (const empId of validIds) {
      const mijozlarCount = clientCountMap.get(empId) || 0;
      const factAmount = revenueMap.get(empId) || 0;

      const planRecord = planMap.get(empId);
      const evalPlan = evalPlanMap.get(empId);

      const planTarget = planRecord
        ? planRecord.target_amount
        : evalPlan
          ? evalPlan.plan
          : 0;

      const currency = planRecord ? planRecord.currency : 'UZS';

      const percentage =
        planTarget > 0
          ? Number(((factAmount / planTarget) * 100).toFixed(2))
          : 0;
      const isAchieved = planTarget > 0 && factAmount >= planTarget;

      metricsMap.set(empId, {
        tushum: {
          amount: factAmount,
          currency,
          formatted: this.formatCurrency(factAmount, currency),
        },
        reja_fakt: {
          plan_target: planTarget,
          fact_amount: factAmount,
          percentage,
          currency,
          status: isAchieved ? 'Bajarildi' : 'Jarayonda',
          status_code: isAchieved ? 'COMPLETED' : 'IN_PROGRESS',
          formatted_plan: this.formatCurrency(planTarget, currency),
          formatted_fact: this.formatCurrency(factAmount, currency),
        },
        mijozlar_count: mijozlarCount,
      });
    }

    return metricsMap;
  }

  /**
   * Resolves an employee's picture_url.
   * Uses Redis caching with a TTL of 840 seconds (14 minutes) to avoid regenerating
   * 15-minute (900 seconds) MinIO presigned URLs on every request.
   */
  async resolvePictureUrl(
    employeeId: string,
    picturePath: string | null | undefined,
  ): Promise<string | null> {
    if (!picturePath) {
      return null;
    }

    const cacheKey = `employee:picture_url:${employeeId}`;
    try {
      const cachedUrl = await this.redisService.get(cacheKey);
      if (cachedUrl) {
        return cachedUrl;
      }
    } catch (error) {
      this.logger.warn(`Redis get failed for ${cacheKey}: ${error}`);
    }

    try {
      const presignedUrl = await this.minioService.getPresignedUrl(
        picturePath,
        900,
      );

      try {
        await this.redisService.set(cacheKey, presignedUrl, 840);
      } catch (cacheError) {
        this.logger.warn(`Redis set failed for ${cacheKey}: ${cacheError}`);
      }

      return presignedUrl;
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for path ${picturePath}: ${error}`,
      );
      return null;
    }
  }

  /**
   * Validates profile picture upload file size and image type.
   */
  private validateImageFile(file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException({
        message: 'No image file uploaded.',
        location: 'missing_file',
      });
    }

    const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
    if (file.size > MAX_SIZE) {
      throw new BadRequestException({
        message: 'Profile picture size exceeds the maximum limit of 5MB.',
        location: 'file_too_large',
      });
    }

    const allowedMimetypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    if (!allowedMimetypes.includes(file.mimetype)) {
      throw new BadRequestException({
        message:
          'Only JPEG, PNG, WEBP, and GIF images are allowed for profile picture.',
        location: 'invalid_image_type',
      });
    }
  }

  /**
   * Upload profile picture for an employee.
   */
  async uploadProfilePicture(employeeId: string, file: Express.Multer.File) {
    this.validateImageFile(file);
    const employee = await this.findEmployeeById(employeeId);

    if (employee._raw_picture_path) {
      try {
        await this.minioService.deleteFile(employee._raw_picture_path);
      } catch (err) {
        this.logger.warn(
          `Failed to remove old profile picture ${employee._raw_picture_path}: ${err}`,
        );
      }
    }

    const fileId = crypto.randomUUID();
    const originalName = file.originalname || 'avatar.png';
    const lastDotIndex = originalName.lastIndexOf('.');
    const ext =
      lastDotIndex !== -1 ? originalName.substring(lastDotIndex) : '.png';
    const objectPath = `avatars/employee_${employeeId}_${Date.now()}_${fileId}${ext}`;

    await this.minioService.uploadFile(file, objectPath);

    await this.knex('employees').where('id', employeeId).update({
      picture_url: objectPath,
      updated_at: this.knex.fn.now(),
    });

    const cacheKey = `employee:picture_url:${employeeId}`;
    try {
      await this.redisService.del(cacheKey);
    } catch (cacheErr) {
      this.logger.warn(`Failed to evict Redis key ${cacheKey}: ${cacheErr}`);
    }

    return this.findEmployeeById(employeeId);
  }

  /**
   * Delete profile picture for an employee.
   */
  async deleteProfilePicture(employeeId: string) {
    const rawEmployee = await this.knex('employees')
      .where('id', employeeId)
      .first();

    if (rawEmployee && rawEmployee.picture_url) {
      try {
        await this.minioService.deleteFile(rawEmployee.picture_url);
      } catch (err) {
        this.logger.warn(
          `Failed to delete MinIO file ${rawEmployee.picture_url}: ${err}`,
        );
      }

      await this.knex('employees').where('id', employeeId).update({
        picture_url: null,
        updated_at: this.knex.fn.now(),
      });

      const cacheKey = `employee:picture_url:${employeeId}`;
      try {
        await this.redisService.del(cacheKey);
      } catch (cacheErr) {
        this.logger.warn(`Failed to evict Redis key ${cacheKey}: ${cacheErr}`);
      }
    }

    return this.findEmployeeById(employeeId);
  }

  // ==========================================
  // DEPARTMENTS METHODS
  // ==========================================

  async createDepartment(dto: CreateDepartmentDto) {
    const existing = await this.knex('departments')
      .where('name', dto.name)
      .first();

    if (existing) {
      throw new BadRequestException({
        message: `Department with name "${dto.name}" already exists.`,
        location: 'department_name_exists',
      });
    }

    const [created] = await this.knex('departments')
      .insert({
        name: dto.name,
        display_name: dto.display_name,
      })
      .returning('*');

    return created;
  }

  async findAllDepartments() {
    return this.knex('departments').select('*').orderBy('display_name', 'asc');
  }

  async findDepartmentById(id: string) {
    const department = await this.knex('departments').where('id', id).first();
    if (!department) {
      throw new NotFoundException({
        message: 'Department not found.',
        location: 'department_not_found',
      });
    }
    return department;
  }

  async updateDepartment(id: string, dto: CreateDepartmentDto) {
    await this.findDepartmentById(id);

    const existingName = await this.knex('departments')
      .where('name', dto.name)
      .whereNot('id', id)
      .first();

    if (existingName) {
      throw new BadRequestException({
        message: `Department with name "${dto.name}" already exists.`,
        location: 'department_name_exists',
      });
    }

    const [updated] = await this.knex('departments')
      .where('id', id)
      .update({
        name: dto.name,
        display_name: dto.display_name,
        updated_at: this.knex.fn.now(),
      })
      .returning('*');

    return updated;
  }

  async deleteDepartment(id: string) {
    await this.findDepartmentById(id);

    // Check if there are employees assigned to this department
    const employeeCount = await this.knex('employees')
      .where('department_id', id)
      .count('id as count')
      .first();

    const count = parseInt((employeeCount?.count as string) || '0', 10);
    if (count > 0) {
      throw new BadRequestException({
        message: `Cannot delete department because it contains ${count} employee(s).`,
        location: 'department_has_employees',
      });
    }

    await this.knex('departments').where('id', id).del();
  }

  // ==========================================
  // EMPLOYEES METHODS
  // ==========================================

  async createEmployee(dto: CreateEmployeeDto) {
    const phoneDigits = this.normalizePhone(dto.phone);

    // Check department exists
    await this.findDepartmentById(dto.department_id);

    // Validate role_id / role
    let roleRecord: any = null;
    if (dto.role_id) {
      roleRecord = await this.knex('roles').where('id', dto.role_id).first();
      if (!roleRecord) {
        throw new BadRequestException({
          message: `Role with ID "${dto.role_id}" not found.`,
          location: 'role_not_found',
        });
      }
    } else if (dto.role) {
      roleRecord = await this.knex('roles')
        .whereRaw('LOWER(name) = ?', [dto.role.toLowerCase()])
        .first();
      if (!roleRecord) {
        throw new BadRequestException({
          message: `Role with name "${dto.role}" not found.`,
          location: 'role_not_found',
        });
      }
    } else {
      throw new BadRequestException({
        message: 'role_id is required to create an employee.',
        location: 'role_id_required',
      });
    }

    // Check if employee with same phone digits already exists
    const existingEmployee = await this.knex('employees')
      .whereRaw("regexp_replace(phone, '[^0-9]', '', 'g') = ?", [phoneDigits])
      .first();

    if (existingEmployee) {
      throw new BadRequestException({
        message: `Employee with phone number "${dto.phone}" already exists.`,
        location: 'employee_phone_exists',
      });
    }

    const employeePayload = {
      first_name: dto.first_name,
      last_name: dto.last_name,
      phone: dto.phone,
      secondary_phone: dto.secondary_phone || null,
      address: dto.address || null,
      department_id: dto.department_id,
      fixed_salary: dto.fixed_salary ? parseFloat(dto.fixed_salary) : 0.0,
      currency: dto.currency || 'UZS',
      color: dto.color || '#CCCCCC',
      is_active: true,
    };

    return this.knex.transaction(async (trx) => {
      const [employee] = await trx('employees')
        .insert(employeePayload)
        .returning('*');

      // Check if there is an existing user account with this phone number to link
      const user = await trx('users')
        .where('phone_number', phoneDigits)
        .first();

      if (user) {
        await trx('users').where('id', user.id).update({
          employee_id: employee.id,
          role_id: roleRecord.id,
          role: roleRecord.name,
          updated_at: trx.fn.now(),
        });
      } else {
        await trx('users').insert({
          employee_id: employee.id,
          phone_number: phoneDigits,
          username: phoneDigits, // default to phone
          password_hash: '', // no password yet
          role_id: roleRecord.id,
          role: roleRecord.name,
          status: 'Pending',
        });
      }

      return employee;
    });
  }

  async findAllEmployees(filters: {
    department_id?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 10;
    const offset = (page - 1) * limit;

    const query = this.knex('employees as e')
      .leftJoin('departments as d', 'e.department_id', 'd.id')
      .leftJoin('users as u', 'e.id', 'u.employee_id')
      .select(
        'e.id',
        'e.first_name',
        'e.last_name',
        'e.phone',
        'e.secondary_phone',
        'e.address',
        'e.department_id',
        'e.fixed_salary',
        'e.currency',
        'e.color',
        'e.picture_url as _raw_picture_path',
        'e.is_active',
        'e.created_at',
        'e.updated_at',
        'd.name as department_name',
        'd.display_name as department_display_name',
        'u.id as user_id',
        'u.username',
        'u.role as user_role',
        'u.status as user_status',
      );

    if (filters.department_id) {
      query.where('e.department_id', filters.department_id);
    }

    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      query.where((qb) => {
        qb.where('e.first_name', 'ilike', searchPattern)
          .orWhere('e.last_name', 'ilike', searchPattern)
          .orWhere('e.phone', 'like', searchPattern);
      });
    }

    // Clone query to count total records before pagination
    const totalQuery = this.knex('employees as e');
    if (filters.department_id) {
      totalQuery.where('e.department_id', filters.department_id);
    }
    if (filters.search) {
      const searchPattern = `%${filters.search}%`;
      totalQuery.where((qb) => {
        qb.where('e.first_name', 'ilike', searchPattern)
          .orWhere('e.last_name', 'ilike', searchPattern)
          .orWhere('e.phone', 'like', searchPattern);
      });
    }
    const [{ count }] = await totalQuery.count('e.id as count');
    const totalItems = parseInt(count as string, 10);

    const rawItems = await query
      .orderBy('e.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const employeeIds = rawItems.map((item) => item.id);
    const metricsMap = await this.getEmployeesMetricsMap(employeeIds);

    const items = await Promise.all(
      rawItems.map(async (item) => {
        const rawPath = item._raw_picture_path;
        delete item._raw_picture_path;
        const presignedUrl = await this.resolvePictureUrl(item.id, rawPath);

        const metrics = metricsMap.get(item.id) || {
          tushum: {
            amount: 0,
            currency: item.currency || 'UZS',
            formatted: this.formatCurrency(0, item.currency),
          },
          reja_fakt: {
            plan_target: 0,
            fact_amount: 0,
            percentage: 0,
            currency: item.currency || 'UZS',
            status: 'Jarayonda',
            status_code: 'IN_PROGRESS',
            formatted_plan: this.formatCurrency(0, item.currency),
            formatted_fact: this.formatCurrency(0, item.currency),
          },
          mijozlar_count: 0,
        };

        return {
          ...item,
          picture_url: presignedUrl,
          tushum: metrics.tushum,
          reja_fakt: metrics.reja_fakt,
          mijozlar_count: metrics.mijozlar_count,
        };
      }),
    );

    return {
      items,
      meta: {
        totalItems,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
      },
    };
  }

  async findEmployeeById(id: string) {
    const employee = await this.knex('employees as e')
      .leftJoin('departments as d', 'e.department_id', 'd.id')
      .leftJoin('users as u', 'e.id', 'u.employee_id')
      .select(
        'e.id',
        'e.first_name',
        'e.last_name',
        'e.phone',
        'e.secondary_phone',
        'e.address',
        'e.department_id',
        'e.fixed_salary',
        'e.currency',
        'e.color',
        'e.picture_url as _raw_picture_path',
        'e.is_active',
        'e.created_at',
        'e.updated_at',
        'd.name as department_name',
        'd.display_name as department_display_name',
        'u.id as user_id',
        'u.username',
        'u.role as user_role',
        'u.status as user_status',
      )
      .where('e.id', id)
      .first();

    if (!employee) {
      throw new NotFoundException({
        message: 'Employee not found.',
        location: 'employee_not_found',
      });
    }

    const presignedUrl = await this.resolvePictureUrl(
      employee.id,
      employee._raw_picture_path,
    );
    delete employee._raw_picture_path;

    const metricsMap = await this.getEmployeesMetricsMap([employee.id]);
    const metrics = metricsMap.get(employee.id) || {
      tushum: {
        amount: 0,
        currency: employee.currency || 'UZS',
        formatted: this.formatCurrency(0, employee.currency),
      },
      reja_fakt: {
        plan_target: 0,
        fact_amount: 0,
        percentage: 0,
        currency: employee.currency || 'UZS',
        status: 'Jarayonda',
        status_code: 'IN_PROGRESS',
        formatted_plan: this.formatCurrency(0, employee.currency),
        formatted_fact: this.formatCurrency(0, employee.currency),
      },
      mijozlar_count: 0,
    };

    return {
      ...employee,
      picture_url: presignedUrl,
      tushum: metrics.tushum,
      reja_fakt: metrics.reja_fakt,
      mijozlar_count: metrics.mijozlar_count,
    };
  }

  async findEmployeeByUserId(userId: string) {
    const user = await this.knex('users as u')
      .leftJoin('employees as e', 'u.employee_id', 'e.id')
      .leftJoin('departments as d', 'e.department_id', 'd.id')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select(
        'u.id as user_id',
        'u.phone_number as user_phone',
        'u.username',
        'u.role',
        'u.role_id',
        'u.status',
        'u.is_active as user_is_active',
        'u.created_at as user_created_at',
        'u.updated_at as user_updated_at',
        'r.name as role_name',
        'r.display_name as role_display_name',
        'r.description as role_description',
        'r.permissions as role_permissions',
        'r.is_system as role_is_system',
        'e.id as employee_id',
        'e.first_name',
        'e.last_name',
        'e.phone as employee_phone',
        'e.secondary_phone',
        'e.address',
        'e.fixed_salary',
        'e.currency',
        'e.color',
        'e.picture_url as employee_picture_path',
        'e.is_active as employee_is_active',
        'd.id as department_id',
        'd.name as department_name',
        'd.display_name as department_display_name',
      )
      .where('u.id', userId)
      .first();

    if (!user) {
      throw new NotFoundException({
        message: 'No associated employee profile found for this user.',
        location: 'employee_profile_missing',
      });
    }

    const presignedUrl = user.employee_id
      ? await this.resolvePictureUrl(
          user.employee_id,
          user.employee_picture_path,
        )
      : null;

    // Helper to normalize permissions object across system modules
    const systemModules = [
      'clients',
      'employees',
      'departments',
      'cargo_kpi',
      'finance',
      'commercial_offers',
      'tasks',
      'currency',
      'attachments',
      'roles',
    ];

    let rawPermissions = user.role_permissions;
    if (typeof rawPermissions === 'string') {
      try {
        rawPermissions = JSON.parse(rawPermissions);
      } catch {
        rawPermissions = {};
      }
    }

    const permissions: Record<
      string,
      { create: boolean; read: boolean; update: boolean; delete: boolean }
    > = {};

    for (const mod of systemModules) {
      const rawMod = rawPermissions?.[mod] || {};
      const isCeo = user.role === 'CEO';

      permissions[mod] = {
        create: isCeo ? true : Boolean(rawMod.create),
        read: isCeo ? true : Boolean(rawMod.read),
        update: isCeo ? true : Boolean(rawMod.update),
        delete: isCeo ? true : Boolean(rawMod.delete),
      };
    }

    const activeRoleName = user.role_name || user.role;

    let metrics: any = {
      tushum: {
        amount: 0,
        currency: user.currency || 'UZS',
        formatted: this.formatCurrency(0, user.currency),
      },
      reja_fakt: {
        plan_target: 0,
        fact_amount: 0,
        percentage: 0,
        currency: user.currency || 'UZS',
        status: 'Jarayonda',
        status_code: 'IN_PROGRESS',
        formatted_plan: this.formatCurrency(0, user.currency),
        formatted_fact: this.formatCurrency(0, user.currency),
      },
      mijozlar_count: 0,
    };

    if (user.employee_id) {
      const metricsMap = await this.getEmployeesMetricsMap([user.employee_id]);
      if (metricsMap.has(user.employee_id)) {
        metrics = metricsMap.get(user.employee_id);
      }
    }

    // Return unified professional response (combining flat layout for e2e tests & nested structure for frontend)
    return {
      // Flat fields for backward compatibility
      id: user.employee_id,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.employee_phone,
      phone_number: user.user_phone,
      secondary_phone: user.secondary_phone,
      address: user.address,
      department_id: user.department_id,
      fixed_salary: user.fixed_salary ? parseFloat(user.fixed_salary) : 0,
      currency: user.currency || 'UZS',
      color: user.color,
      picture_url: presignedUrl,
      is_active: !!user.employee_is_active,
      created_at: user.user_created_at,
      updated_at: user.user_updated_at,
      department_name: user.department_name,
      department_display_name: user.department_display_name,
      user_id: user.user_id,
      username: user.username,
      user_role: activeRoleName,
      user_status: user.status,
      role_id: user.role_id,
      permissions: permissions,
      tushum: metrics.tushum,
      reja_fakt: metrics.reja_fakt,
      mijozlar_count: metrics.mijozlar_count,

      // Nested structures for clean modern frontends
      user: {
        id: user.user_id,
        phone_number: user.user_phone,
        username: user.username,
        role: activeRoleName,
        role_id: user.role_id,
        status: user.status,
        is_active: !!user.user_is_active,
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
      employee: user.employee_id
        ? {
            id: user.employee_id,
            first_name: user.first_name,
            last_name: user.last_name,
            phone: user.employee_phone,
            secondary_phone: user.secondary_phone,
            address: user.address,
            color: user.color,
            picture_url: presignedUrl,
            fixed_salary: user.fixed_salary ? parseFloat(user.fixed_salary) : 0,
            currency: user.currency || 'UZS',
            is_active: !!user.employee_is_active,
            department: user.department_id
              ? {
                  id: user.department_id,
                  name: user.department_name,
                  display_name: user.department_display_name,
                }
              : null,
            tushum: metrics.tushum,
            reja_fakt: metrics.reja_fakt,
            mijozlar_count: metrics.mijozlar_count,
          }
        : null,
    };
  }

  async updateEmployee(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.findEmployeeById(id);

    const updatePayload: any = {};
    if (dto.first_name !== undefined) updatePayload.first_name = dto.first_name;
    if (dto.last_name !== undefined) updatePayload.last_name = dto.last_name;
    if (dto.secondary_phone !== undefined)
      updatePayload.secondary_phone = dto.secondary_phone;
    if (dto.address !== undefined) updatePayload.address = dto.address;
    if (dto.fixed_salary !== undefined)
      updatePayload.fixed_salary = parseFloat(dto.fixed_salary);
    if (dto.currency !== undefined) updatePayload.currency = dto.currency;
    if (dto.color !== undefined) updatePayload.color = dto.color;

    if (dto.department_id !== undefined) {
      await this.findDepartmentById(dto.department_id);
      updatePayload.department_id = dto.department_id;
    }

    if (dto.phone !== undefined) {
      const phoneDigits = this.normalizePhone(dto.phone);
      const existingPhone = await this.knex('employees')
        .whereRaw("regexp_replace(phone, '[^0-9]', '', 'g') = ?", [phoneDigits])
        .whereNot('id', id)
        .first();

      if (existingPhone) {
        throw new BadRequestException({
          message: `Employee with phone number "${dto.phone}" already exists.`,
          location: 'employee_phone_exists',
        });
      }
      updatePayload.phone = dto.phone;
    }

    if (dto.is_active !== undefined) {
      updatePayload.is_active = dto.is_active;
    }

    return this.knex.transaction(async (trx) => {
      const [updated] = await trx('employees')
        .where('id', id)
        .update({
          ...updatePayload,
          updated_at: trx.fn.now(),
        })
        .returning('*');

      // Update role if role_id or role is passed
      if (dto.role_id || dto.role) {
        let roleRecord: any = null;
        if (dto.role_id) {
          roleRecord = await trx('roles').where('id', dto.role_id).first();
          if (!roleRecord) {
            throw new BadRequestException({
              message: `Role with ID "${dto.role_id}" not found.`,
              location: 'role_not_found',
            });
          }
        } else if (dto.role) {
          roleRecord = await trx('roles')
            .whereRaw('LOWER(name) = ?', [dto.role.toLowerCase()])
            .first();
        }

        if (roleRecord) {
          await trx('users').where('employee_id', id).update({
            role_id: roleRecord.id,
            role: roleRecord.name,
            updated_at: trx.fn.now(),
          });
        }
      }

      // If is_active is modified, sync with the linked user account
      if (dto.is_active !== undefined) {
        const user = await trx('users').where('employee_id', id).first();
        if (user) {
          await trx('users')
            .where('id', user.id)
            .update({
              is_active: dto.is_active,
              status: dto.is_active ? 'Open' : 'Banned',
              updated_at: trx.fn.now(),
            });
        }
      }

      return updated;
    });
  }

  async deleteEmployee(id: string) {
    await this.findEmployeeById(id);

    return this.knex.transaction(async (trx) => {
      // Linked users will have their employee_id set to null automatically due to
      // FOREIGN KEY references ... onDelete("SET NULL")
      // However, we should also deactivate/clean up that user so they cannot authenticate
      const user = await trx('users').where('employee_id', id).first();
      if (user) {
        await trx('users').where('id', user.id).update({
          employee_id: null,
          is_active: false,
          status: 'Deleted',
          updated_at: trx.fn.now(),
        });
      }

      await trx('employees').where('id', id).del();
    });
  }

  /**
   * Helper to check if a specific user has permission for a module and action.
   */
  async checkUserPermission(
    userId: string,
    module: string,
    action: 'create' | 'read' | 'update' | 'delete',
  ): Promise<boolean> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        userId,
      );
    if (!isUuid) {
      return false;
    }

    const dbUser = await this.knex('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select('u.role', 'r.name as role_name', 'r.permissions')
      .where('u.id', userId)
      .first();

    if (!dbUser) {
      return false;
    }

    const effectiveRole = dbUser.role_name || dbUser.role;

    if (dbUser.role === 'CEO' || effectiveRole === 'CEO') {
      return true;
    }

    let rawPermissions = dbUser.permissions;

    if (!rawPermissions && dbUser.role) {
      const fallbackRole = await this.knex('roles')
        .whereRaw('LOWER(name) = ?', [dbUser.role.toLowerCase()])
        .first();
      if (fallbackRole) {
        rawPermissions = fallbackRole.permissions;
      }
    }

    const permissions =
      typeof rawPermissions === 'string'
        ? JSON.parse(rawPermissions)
        : rawPermissions || {};

    return Boolean(permissions?.[module]?.[action]);
  }
}
