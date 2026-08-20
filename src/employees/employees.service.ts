import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import 'multer';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { MinioService } from '../minio/minio.service';
import { RedisService } from '../redis/redis.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import * as crypto from 'crypto';

export interface TushumMetric {
  amount: number;
  currency: string;
  formatted: string;
}

export interface RejaFaktMetric {
  plan_target: number;
  fact_amount: number;
  percentage: number;
  currency: string;
  status: string;
  status_code: string;
  formatted_plan: string;
  formatted_fact: string;
}

export interface EmployeeMetrics {
  tushum: TushumMetric;
  reja_fakt: RejaFaktMetric;
  mijozlar_count: number;
}

export interface DepartmentRow {
  id: string;
  name: string;
  display_name: string;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface RoleRow {
  id: string;
  name: string;
  display_name?: string | null;
  description?: string | null;
  permissions?: Record<string, unknown> | string | null;
  is_system?: boolean | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  secondary_phone?: string | null;
  address?: string | null;
  department_id: string;
  fixed_salary: number | string;
  currency: string;
  color: string;
  picture_url?: string | null;
  is_active: boolean;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface JoinedEmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  secondary_phone: string | null;
  address: string | null;
  department_id: string;
  fixed_salary: number | string;
  currency: string;
  color: string;
  _raw_picture_path?: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  department_name: string;
  department_display_name: string;
  user_id: string | null;
  username: string | null;
  user_role: string | null;
  user_status: string | null;
}

export interface EmployeeWithMetrics extends Omit<
  JoinedEmployeeRow,
  '_raw_picture_path'
> {
  picture_url: string | null;
  tushum: TushumMetric;
  reja_fakt: RejaFaktMetric;
  mijozlar_count: number;
}

export interface UserRow {
  id: string;
  employee_id?: string | null;
  phone_number?: string | null;
  username?: string | null;
  password_hash?: string | null;
  role?: string | null;
  role_id?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
}

export interface UserWithRoleEmployeeRow {
  user_id: string;
  user_phone: string;
  username: string;
  role: string;
  role_id: string | null;
  status: string;
  user_is_active: boolean;
  user_created_at: Date | string;
  user_updated_at: Date | string;
  role_name: string | null;
  role_display_name: string | null;
  role_description: string | null;
  role_permissions: Record<string, unknown> | string | null;
  role_is_system: boolean | null;
  employee_id: string | null;
  first_name: string | null;
  last_name: string | null;
  employee_phone: string | null;
  secondary_phone: string | null;
  address: string | null;
  fixed_salary: number | string | null;
  currency: string | null;
  color: string | null;
  employee_picture_path: string | null;
  employee_is_active: boolean | null;
  department_id: string | null;
  department_name: string | null;
  department_display_name: string | null;
}

interface ClientCountRow {
  employee_id: string;
  count: string | number;
}

interface CargoSaleRow {
  employee_id: string;
  total_sales: string | number | null;
}

interface SalesManagerEvalRow {
  employee_id: string;
  total_sales: string | number | null;
  plan_target_max: string | number | null;
  is_plan_achieved: boolean | null;
}

interface EmployeePlanRow {
  employee_id: string;
  target_amount: string | number | null;
  currency: string | null;
}

export interface ModulePermissions {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

export interface UserEmployeeResponse {
  id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  phone_number: string;
  secondary_phone: string | null;
  address: string | null;
  department_id: string | null;
  fixed_salary: number;
  currency: string;
  color: string | null;
  picture_url: string | null;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  department_name: string | null;
  department_display_name: string | null;
  user_id: string;
  username: string;
  role: string;
  user_role: string;
  user_status: string;
  role_id: string | null;
  permissions: Record<string, ModulePermissions>;
  tushum: TushumMetric;
  reja_fakt: RejaFaktMetric;
  mijozlar_count: number;
  user: {
    id: string;
    phone_number: string;
    username: string;
    role: string;
    role_id: string | null;
    status: string;
    is_active: boolean;
    role_details: {
      id: string;
      name: string;
      display_name: string;
      description: string | null;
      is_system: boolean;
      permissions: Record<string, ModulePermissions>;
    } | null;
    permissions: Record<string, ModulePermissions>;
  };
  employee: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    secondary_phone: string | null;
    address: string | null;
    color: string | null;
    picture_url: string | null;
    fixed_salary: number;
    currency: string;
    is_active: boolean;
    department: {
      id: string;
      name: string | null;
      display_name: string | null;
    } | null;
    tushum: TushumMetric;
    reja_fakt: RejaFaktMetric;
    mijozlar_count: number;
  } | null;
}

export interface PaginationMeta {
  totalItems: number;
  itemCount: number;
  itemsPerPage: number;
  totalPages: number;
  currentPage: number;
}

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
        `Failed to verify picture_url column on employees table: ${String(err)}`,
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
  private async getEmployeesMetricsMap(
    employeeIds: string[],
  ): Promise<Map<string, EmployeeMetrics>> {
    const validIds = (employeeIds || []).filter(Boolean);
    if (!validIds.length) {
      return new Map<string, EmployeeMetrics>();
    }

    const [clientCounts, cargoSales, salesManagerEvals, plans] =
      await Promise.all([
        // 1. Mijozlar count per assigned employee
        this.knex('clients')
          .whereIn('assigned_employee_id', validIds)
          .select('assigned_employee_id as employee_id')
          .count('id as count')
          .groupBy('assigned_employee_id') as unknown as Promise<
          ClientCountRow[]
        >,

        // 2. Cargo transactions total revenue per employee
        this.knex('cargo_transactions')
          .whereIn('employee_id', validIds)
          .select('employee_id')
          .sum('sell_price as total_sales')
          .groupBy('employee_id') as unknown as Promise<CargoSaleRow[]>,

        // 3. Sales manager evaluations (plan/revenue source)
        this.knex.schema
          .hasTable('sales_manager_evaluations')
          .then(async (hasTable): Promise<SalesManagerEvalRow[]> => {
            if (!hasTable) return [];
            const rows = await this.knex<SalesManagerEvalRow>(
              'sales_manager_evaluations',
            )
              .whereIn('employee_id', validIds)
              .select(
                'employee_id',
                'total_sales',
                'plan_target_max',
                'is_plan_achieved',
              )
              .orderBy('created_at', 'desc');
            return rows;
          }),

        // 4. Employee plans
        this.knex.schema
          .hasTable('employee_plans')
          .then(async (hasTable): Promise<EmployeePlanRow[]> => {
            if (!hasTable) return [];
            const rows = await this.knex<EmployeePlanRow>('employee_plans')
              .whereIn('employee_id', validIds)
              .select('employee_id', 'target_amount', 'currency')
              .orderBy('created_at', 'desc');
            return rows;
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

    const metricsMap = new Map<string, EmployeeMetrics>();

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
      this.logger.warn(`Redis get failed for ${cacheKey}: ${String(error)}`);
    }

    try {
      const presignedUrl = await this.minioService.getPresignedUrl(
        picturePath,
        900,
      );

      try {
        await this.redisService.set(cacheKey, presignedUrl, 840);
      } catch (cacheError) {
        this.logger.warn(
          `Redis set failed for ${cacheKey}: ${String(cacheError)}`,
        );
      }

      return presignedUrl;
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for path ${picturePath}: ${String(error)}`,
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
  async uploadProfilePicture(
    employeeId: string,
    file: Express.Multer.File,
  ): Promise<EmployeeWithMetrics> {
    this.validateImageFile(file);
    const rawEmployee = (await this.knex('employees')
      .where('id', employeeId)
      .select('picture_url')
      .first()) as unknown as { picture_url: string | null } | undefined;

    if (rawEmployee?.picture_url) {
      try {
        await this.minioService.deleteFile(rawEmployee.picture_url);
      } catch (err) {
        this.logger.warn(
          `Failed to remove old profile picture ${rawEmployee.picture_url}: ${String(err)}`,
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
      this.logger.warn(
        `Failed to evict Redis key ${cacheKey}: ${String(cacheErr)}`,
      );
    }

    return this.findEmployeeById(employeeId);
  }

  /**
   * Delete profile picture for an employee.
   */
  async deleteProfilePicture(employeeId: string): Promise<EmployeeWithMetrics> {
    const rawEmployee = (await this.knex('employees')
      .where('id', employeeId)
      .select('picture_url')
      .first()) as unknown as { picture_url: string | null } | undefined;

    if (rawEmployee && rawEmployee.picture_url) {
      try {
        await this.minioService.deleteFile(rawEmployee.picture_url);
      } catch (err) {
        this.logger.warn(
          `Failed to delete MinIO file ${rawEmployee.picture_url}: ${String(err)}`,
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
        this.logger.warn(
          `Failed to evict Redis key ${cacheKey}: ${String(cacheErr)}`,
        );
      }
    }

    return this.findEmployeeById(employeeId);
  }

  // ==========================================
  // DEPARTMENTS METHODS
  // ==========================================

  async createDepartment(dto: CreateDepartmentDto): Promise<DepartmentRow> {
    const existing = (await this.knex('departments')
      .where('name', dto.name)
      .first()) as unknown as DepartmentRow | undefined;

    if (existing) {
      throw new BadRequestException({
        message: `Department with name "${dto.name}" already exists.`,
        location: 'department_name_exists',
      });
    }

    const [created] = (await this.knex('departments')
      .insert({
        name: dto.name,
        display_name: dto.display_name,
      })
      .returning('*')) as unknown as DepartmentRow[];

    return created;
  }

  async findAllDepartments(): Promise<DepartmentRow[]> {
    const departments = (await this.knex('departments')
      .select('*')
      .orderBy('display_name', 'asc')) as unknown as DepartmentRow[];
    return departments;
  }

  async findDepartmentById(id: string): Promise<DepartmentRow> {
    const department = (await this.knex('departments')
      .where('id', id)
      .first()) as unknown as DepartmentRow | undefined;
    if (!department) {
      throw new NotFoundException({
        message: 'Department not found.',
        location: 'department_not_found',
      });
    }
    return department;
  }

  async updateDepartment(
    id: string,
    dto: CreateDepartmentDto,
  ): Promise<DepartmentRow> {
    await this.findDepartmentById(id);

    const existingName = (await this.knex('departments')
      .where('name', dto.name)
      .whereNot('id', id)
      .first()) as unknown as DepartmentRow | undefined;

    if (existingName) {
      throw new BadRequestException({
        message: `Department with name "${dto.name}" already exists.`,
        location: 'department_name_exists',
      });
    }

    const [updated] = (await this.knex('departments')
      .where('id', id)
      .update({
        name: dto.name,
        display_name: dto.display_name,
        updated_at: this.knex.fn.now(),
      })
      .returning('*')) as unknown as DepartmentRow[];

    return updated;
  }

  async deleteDepartment(id: string): Promise<void> {
    await this.findDepartmentById(id);

    // Check if there are employees assigned to this department
    const employeeCount = (await this.knex('employees')
      .where('department_id', id)
      .count('id as count')
      .first()) as unknown as { count?: string | number } | undefined;

    const count = parseInt(String(employeeCount?.count || '0'), 10);
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

  async createEmployee(dto: CreateEmployeeDto): Promise<EmployeeRow> {
    const phoneDigits = this.normalizePhone(dto.phone);

    // Check department exists
    await this.findDepartmentById(dto.department_id);

    // Validate role_id / role
    let roleRecord: RoleRow | undefined = undefined;
    if (dto.role_id) {
      roleRecord = await this.knex<RoleRow>('roles')
        .where('id', dto.role_id)
        .first();
      if (!roleRecord) {
        throw new BadRequestException({
          message: `Role with ID "${dto.role_id}" not found.`,
          location: 'role_not_found',
        });
      }
    } else if (dto.role) {
      roleRecord = await this.knex<RoleRow>('roles')
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

    const activeRole = roleRecord;

    // Check if employee with same phone digits already exists
    const existingEmployee = (await this.knex('employees')
      .whereRaw("regexp_replace(phone, '[^0-9]', '', 'g') = ?", [phoneDigits])
      .first()) as unknown as EmployeeRow | undefined;

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

    return this.knex.transaction(async (trx): Promise<EmployeeRow> => {
      const [employee] = (await trx('employees')
        .insert(employeePayload)
        .returning('*')) as unknown as EmployeeRow[];

      // Check if there is an existing user account with this phone number to link
      const user = (await trx('users')
        .where('phone_number', phoneDigits)
        .first()) as unknown as UserRow | undefined;

      if (user) {
        await trx('users').where('id', user.id).update({
          employee_id: employee.id,
          role_id: activeRole.id,
          role: activeRole.name,
          updated_at: trx.fn.now(),
        });
      } else {
        await trx('users').insert({
          employee_id: employee.id,
          phone_number: phoneDigits,
          username: phoneDigits, // default to phone
          password_hash: '', // no password yet
          role_id: activeRole.id,
          role: activeRole.name,
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
  }): Promise<{ items: EmployeeWithMetrics[]; meta: PaginationMeta }> {
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
    const [{ count }] = (await totalQuery.count(
      'e.id as count',
    )) as unknown as [{ count: string | number }];
    const totalItems = parseInt(String(count || '0'), 10);

    const rawItems = (await query
      .orderBy('e.created_at', 'desc')
      .limit(limit)
      .offset(offset)) as unknown as JoinedEmployeeRow[];

    const employeeIds = rawItems.map((item) => item.id);
    const metricsMap = await this.getEmployeesMetricsMap(employeeIds);

    const items = await Promise.all(
      rawItems.map(async (item): Promise<EmployeeWithMetrics> => {
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

  async findEmployeeById(id: string): Promise<EmployeeWithMetrics> {
    const employee = (await this.knex('employees as e')
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
      .first()) as unknown as JoinedEmployeeRow | undefined;

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

  async findEmployeeByUserId(userId: string): Promise<UserEmployeeResponse> {
    const user = (await this.knex('users as u')
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
      .first()) as unknown as UserWithRoleEmployeeRow | undefined;

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
      'cargo_registrations',
      'finance',
      'commercial_offers',
      'tasks',
      'currency',
      'attachments',
      'roles',
    ];

    let rawPermissions: unknown = user.role_permissions;

    if (!rawPermissions && user.role) {
      const fallbackRole = (await this.knex('roles')
        .whereRaw('LOWER(name) = ?', [user.role.toLowerCase()])
        .first()) as unknown as RoleRow | undefined;
      if (fallbackRole) {
        rawPermissions = fallbackRole.permissions ?? null;
      }
    }

    if (typeof rawPermissions === 'string') {
      try {
        rawPermissions = JSON.parse(rawPermissions);
      } catch {
        rawPermissions = {};
      }
    }

    const parsedPermissions = (
      typeof rawPermissions === 'object' && rawPermissions !== null
        ? rawPermissions
        : {}
    ) as Record<string, Record<string, boolean>>;

    const permissions: Record<string, ModulePermissions> = {};

    for (const mod of systemModules) {
      const rawMod = parsedPermissions[mod] || {};
      const isCeo = user.role === 'CEO';

      permissions[mod] = {
        create: isCeo ? true : Boolean(rawMod.create),
        read: isCeo ? true : Boolean(rawMod.read),
        update: isCeo ? true : Boolean(rawMod.update),
        delete: isCeo ? true : Boolean(rawMod.delete),
      };
    }

    const activeRoleName = user.role_name || user.role;
    const defaultCurrency = user.currency || 'UZS';

    let metrics: EmployeeMetrics = {
      tushum: {
        amount: 0,
        currency: defaultCurrency,
        formatted: this.formatCurrency(0, defaultCurrency),
      },
      reja_fakt: {
        plan_target: 0,
        fact_amount: 0,
        percentage: 0,
        currency: defaultCurrency,
        status: 'Jarayonda',
        status_code: 'IN_PROGRESS',
        formatted_plan: this.formatCurrency(0, defaultCurrency),
        formatted_fact: this.formatCurrency(0, defaultCurrency),
      },
      mijozlar_count: 0,
    };

    if (user.employee_id) {
      const metricsMap = await this.getEmployeesMetricsMap([user.employee_id]);
      const foundMetrics = metricsMap.get(user.employee_id);
      if (foundMetrics) {
        metrics = foundMetrics;
      }
    }

    const fixedSalaryNum = user.fixed_salary
      ? typeof user.fixed_salary === 'number'
        ? user.fixed_salary
        : parseFloat(user.fixed_salary)
      : 0;

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
      fixed_salary: fixedSalaryNum,
      currency: defaultCurrency,
      color: user.color,
      picture_url: presignedUrl,
      is_active: Boolean(user.employee_is_active),
      created_at: user.user_created_at,
      updated_at: user.user_updated_at,
      department_name: user.department_name,
      department_display_name: user.department_display_name,
      user_id: user.user_id,
      username: user.username,
      role: activeRoleName,
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
        is_active: Boolean(user.user_is_active),
        role_details: user.role_id
          ? {
              id: user.role_id,
              name: activeRoleName,
              display_name: user.role_display_name || activeRoleName,
              description: user.role_description,
              is_system: Boolean(user.role_is_system),
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
            fixed_salary: fixedSalaryNum,
            currency: defaultCurrency,
            is_active: Boolean(user.employee_is_active),
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

  async updateEmployee(
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeRow> {
    await this.findEmployeeById(id);

    const updatePayload: Partial<EmployeeRow> = {};
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

    let phoneDigits: string | undefined = undefined;
    if (dto.phone !== undefined) {
      phoneDigits = this.normalizePhone(dto.phone);
      const existingPhone = (await this.knex('employees')
        .whereRaw("regexp_replace(phone, '[^0-9]', '', 'g') = ?", [phoneDigits])
        .whereNot('id', id)
        .first()) as unknown as EmployeeRow | undefined;

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

    return this.knex.transaction(async (trx): Promise<EmployeeRow> => {
      const [updated] = (await trx('employees')
        .where('id', id)
        .update({
          ...updatePayload,
          updated_at: trx.fn.now(),
        })
        .returning('*')) as unknown as EmployeeRow[];

      // Resolve role if role_id or role is passed
      let roleRecord: RoleRow | undefined = undefined;
      if (dto.role_id || dto.role) {
        if (dto.role_id) {
          roleRecord = await trx<RoleRow>('roles')
            .where('id', dto.role_id)
            .first();
          if (!roleRecord) {
            throw new BadRequestException({
              message: `Role with ID "${dto.role_id}" not found.`,
              location: 'role_not_found',
            });
          }
        } else if (dto.role) {
          roleRecord = await trx<RoleRow>('roles')
            .whereRaw('LOWER(name) = ?', [dto.role.toLowerCase()])
            .first();
        }
      }

      // Check linked user for this employee
      const linkedUser = (await trx('users')
        .where('employee_id', id)
        .first()) as unknown as UserRow | undefined;

      // Synchronize phone and username with user account
      if (phoneDigits !== undefined) {
        const existingUserWithPhone = (await trx('users')
          .where('phone_number', phoneDigits)
          .first()) as unknown as UserRow | undefined;

        if (
          existingUserWithPhone &&
          (!linkedUser || existingUserWithPhone.id !== linkedUser.id)
        ) {
          if (!existingUserWithPhone.employee_id) {
            // Remove orphaned unlinked user (e.g. from Telegram OTP bot)
            await trx('users').where('id', existingUserWithPhone.id).del();
          } else {
            throw new BadRequestException({
              message: `User account with phone number "${dto.phone}" is already associated with another employee.`,
              location: 'user_phone_exists',
            });
          }
        }

        if (linkedUser) {
          await trx('users').where('id', linkedUser.id).update({
            phone_number: phoneDigits,
            username: phoneDigits,
            updated_at: trx.fn.now(),
          });
        } else {
          await trx('users').insert({
            employee_id: id,
            phone_number: phoneDigits,
            username: phoneDigits,
            password_hash: '',
            role_id: roleRecord ? roleRecord.id : null,
            role: roleRecord ? roleRecord.name : 'EMPLOYEE',
            status: 'Pending',
          });
        }
      }

      // Update role if role_id or role is passed
      if (roleRecord) {
        await trx('users').where('employee_id', id).update({
          role_id: roleRecord.id,
          role: roleRecord.name,
          updated_at: trx.fn.now(),
        });
      }

      // If is_active is modified, sync with the linked user account
      if (dto.is_active !== undefined) {
        const user = (await trx('users')
          .where('employee_id', id)
          .first()) as unknown as UserRow | undefined;
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

  async deleteEmployee(id: string): Promise<void> {
    await this.findEmployeeById(id);

    return this.knex.transaction(async (trx): Promise<void> => {
      // Linked users will have their employee_id set to null automatically due to
      // FOREIGN KEY references ... onDelete("SET NULL")
      // However, we should also deactivate/clean up that user so they cannot authenticate
      const user = (await trx('users')
        .where('employee_id', id)
        .first()) as unknown as UserRow | undefined;
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

    const dbUser = (await this.knex('users as u')
      .leftJoin('roles as r', 'u.role_id', 'r.id')
      .select('u.role', 'r.name as role_name', 'r.permissions')
      .where('u.id', userId)
      .first()) as unknown as
      | {
          role: string;
          role_name: string | null;
          permissions: Record<string, unknown> | string | null;
        }
      | undefined;

    if (!dbUser) {
      return false;
    }

    const effectiveRole = dbUser.role_name || dbUser.role;

    if (dbUser.role === 'CEO' || effectiveRole === 'CEO') {
      return true;
    }

    let rawPermissions = dbUser.permissions;

    if (!rawPermissions && dbUser.role) {
      const fallbackRole = (await this.knex('roles')
        .whereRaw('LOWER(name) = ?', [dbUser.role.toLowerCase()])
        .first()) as unknown as RoleRow | undefined;
      if (fallbackRole) {
        rawPermissions = fallbackRole.permissions ?? null;
      }
    }

    let permissionsObj: Record<string, Record<string, boolean>> = {};
    if (typeof rawPermissions === 'string') {
      try {
        permissionsObj = JSON.parse(rawPermissions) as Record<
          string,
          Record<string, boolean>
        >;
      } catch {
        permissionsObj = {};
      }
    } else if (typeof rawPermissions === 'object' && rawPermissions !== null) {
      permissionsObj = rawPermissions as Record<
        string,
        Record<string, boolean>
      >;
    }

    return Boolean(permissionsObj[module]?.[action]);
  }
}
