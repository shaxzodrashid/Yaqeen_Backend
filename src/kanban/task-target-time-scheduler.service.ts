import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';
import { TelegramBotService } from '../auth/telegram-bot.service';

@Injectable()
export class TaskTargetTimeSchedulerService {
  private readonly logger = new Logger(TaskTargetTimeSchedulerService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  /**
   * Cron job that executes every minute to check if any task target time or due date has been reached.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkTargetTimeReaches(): Promise<void> {
    try {
      const now = new Date();

      // Find tasks where target_time or due_date is reached/past, target_time_notified is false, and completed_at is NULL
      const tasksToNotify = await this.knex('tasks as t')
        .join('kanban_columns as c', 't.column_id', 'c.id')
        .select(
          't.id',
          't.title',
          't.target_time',
          't.due_date',
          'c.name as column_name',
        )
        .whereNull('t.completed_at')
        .where('t.target_time_notified', false)
        .where((builder) => {
          builder
            .where('t.target_time', '<=', now)
            .orWhere('t.due_date', '<=', now);
        });

      if (tasksToNotify.length === 0) {
        return;
      }

      this.logger.log(
        `Target time scheduler found ${tasksToNotify.length} task(s) reaching target time. Processing notifications...`,
      );

      for (const task of tasksToNotify) {
        // Fetch assigned employees
        const assignees = await this.knex('task_assignees')
          .where('task_id', task.id)
          .select('employee_id');

        const empIds = assignees.map((a) => a.employee_id);

        if (empIds.length > 0) {
          const targetTime = task.target_time || task.due_date;
          await this.telegramBotService.sendTargetTimeNotification({
            taskTitle: task.title,
            targetTime: targetTime,
            assigneeEmployeeIds: empIds,
          });
        }

        // Mark as notified so we do not notify multiple times
        await this.knex('tasks').where('id', task.id).update({
          target_time_notified: true,
          updated_at: this.knex.fn.now(),
        });

        await this.knex('task_activity_logs').insert({
          task_id: task.id,
          action: 'TARGET_TIME_REACHED_NOTIFIED',
          details: `Target time notification dispatched to assigned employees.`,
        });
      }
    } catch (err) {
      this.logger.error(
        `Error executing target time scheduler check: ${err.message}`,
        err.stack,
      );
    }
  }
}
