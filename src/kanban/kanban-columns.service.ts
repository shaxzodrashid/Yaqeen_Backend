import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { ReorderColumnsDto } from './dto/reorder-columns.dto';

export interface KanbanColumn {
  id: string;
  board_id: string;
  name: string;
  position: number;
  allowed_roles?: string[] | null;
  color?: string | null;
  is_done_status: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class KanbanColumnsService {
  private readonly logger = new Logger(KanbanColumnsService.name);

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  /**
   * Create a new dynamic column / status in a board.
   */
  async createColumn(dto: CreateColumnDto): Promise<KanbanColumn> {
    const board = await this.knex('kanban_boards')
      .where('id', dto.board_id)
      .first();

    if (!board) {
      throw new BadRequestException({
        message: `Board with ID '${dto.board_id}' not found.`,
        location: 'board_not_found',
      });
    }

    let pos = dto.position;
    if (pos === undefined || pos === null) {
      const maxCol = await this.knex('kanban_columns')
        .where('board_id', dto.board_id)
        .max('position as maxPos')
        .first();
      pos =
        maxCol && maxCol.maxPos !== null ? (maxCol.maxPos as number) + 1 : 0;
    }

    const [column] = await this.knex<KanbanColumn>('kanban_columns')
      .insert({
        board_id: dto.board_id,
        name: dto.name,
        position: pos,
        allowed_roles: dto.allowed_roles
          ? (JSON.stringify(dto.allowed_roles) as any)
          : undefined,
        color: dto.color || undefined,
        is_done_status: dto.is_done_status || false,
      })
      .returning('*');

    return this.formatColumn(column);
  }

  /**
   * Update column details (name, position, allowed_roles, color, is_done_status).
   */
  async updateColumn(id: string, dto: UpdateColumnDto): Promise<KanbanColumn> {
    const existing = await this.knex<KanbanColumn>('kanban_columns')
      .where('id', id)
      .first();

    if (!existing) {
      throw new NotFoundException({
        message: `Kanban column with ID '${id}' not found.`,
        location: 'column_not_found',
      });
    }

    const updateData: any = {
      ...dto,
      updated_at: this.knex.fn.now(),
    };

    if (dto.allowed_roles !== undefined) {
      updateData.allowed_roles = dto.allowed_roles
        ? JSON.stringify(dto.allowed_roles)
        : null;
    }

    const [updated] = await this.knex<KanbanColumn>('kanban_columns')
      .where('id', id)
      .update(updateData)
      .returning('*');

    return this.formatColumn(updated);
  }

  /**
   * Reorder all columns in a board according to an array of column IDs.
   */
  async reorderColumns(
    boardId: string,
    dto: ReorderColumnsDto,
  ): Promise<KanbanColumn[]> {
    const board = await this.knex('kanban_boards').where('id', boardId).first();

    if (!board) {
      throw new NotFoundException({
        message: `Board with ID '${boardId}' not found.`,
        location: 'board_not_found',
      });
    }

    await this.knex.transaction(async (trx) => {
      for (let i = 0; i < dto.column_ids.length; i++) {
        await trx('kanban_columns')
          .where('id', dto.column_ids[i])
          .where('board_id', boardId)
          .update({
            position: i,
            updated_at: trx.fn.now(),
          });
      }
    });

    const columns = await this.knex<KanbanColumn>('kanban_columns')
      .where('board_id', boardId)
      .orderBy('position', 'asc');

    return columns.map((col) => this.formatColumn(col));
  }

  /**
   * Delete a column by ID.
   */
  async deleteColumn(id: string): Promise<void> {
    const count = await this.knex('kanban_columns').where('id', id).del();
    if (count === 0) {
      throw new NotFoundException({
        message: `Kanban column with ID '${id}' not found.`,
        location: 'column_not_found',
      });
    }
  }

  /**
   * Validates if a given user role has permission to move tasks into / manage this column status.
   */
  async validateStatusPermission(
    columnId: string,
    userRole?: string,
  ): Promise<KanbanColumn> {
    const column = await this.knex<KanbanColumn>('kanban_columns')
      .where('id', columnId)
      .first();

    if (!column) {
      throw new NotFoundException({
        message: `Kanban column/status with ID '${columnId}' not found.`,
        location: 'column_not_found',
      });
    }

    const formatted = this.formatColumn(column);

    if (
      userRole &&
      userRole !== 'CEO' &&
      formatted.allowed_roles &&
      formatted.allowed_roles.length > 0
    ) {
      const isAllowed = formatted.allowed_roles.includes(userRole);
      if (!isAllowed) {
        throw new ForbiddenException({
          message: `Access denied: Role '${userRole}' does not have permission to transition tasks to status '${column.name}'.`,
          location: 'status_permission_denied',
        });
      }
    }

    return formatted;
  }

  private formatColumn(row: KanbanColumn): KanbanColumn {
    let roles: string[] | null = null;
    if (row.allowed_roles) {
      roles =
        typeof row.allowed_roles === 'string'
          ? JSON.parse(row.allowed_roles)
          : row.allowed_roles;
    }
    return {
      ...row,
      allowed_roles: roles,
      is_done_status: Boolean(row.is_done_status),
    };
  }
}
