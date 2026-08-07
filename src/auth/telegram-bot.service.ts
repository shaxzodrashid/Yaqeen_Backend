import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KNEX_CONNECTION } from '../database/database.module';
import { Knex } from 'knex';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private botToken: string;
  private isPolling = false;
  private offset = 0;

  constructor(
    private readonly configService: ConfigService,
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
  ) {
    this.botToken = this.configService.get<string>('telegramBotToken') || '';
  }

  async onModuleInit() {
    if (!this.botToken) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN is not configured in the environment. Telegram bot polling will be skipped. OTP codes will be logged to console.',
      );
      return;
    }

    // Clear old updates on boot so we don't process stale messages
    try {
      const initUrl = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=-1&limit=1`;
      const res = await fetch(initUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.result.length > 0) {
          this.offset = data.result[0].update_id + 1;
          this.logger.log(
            `Cleared stale updates. Current offset set to: ${this.offset}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Error clearing stale Telegram updates: ${err.message}`,
      );
    }

    this.isPolling = true;
    this.startPolling();
  }

  onModuleDestroy() {
    this.isPolling = false;
  }

  private async startPolling() {
    this.logger.log('Starting Telegram bot long-polling loop...');
    while (this.isPolling) {
      try {
        await this.pollUpdates();
      } catch (err) {
        this.logger.error(`Error in Telegram bot polling loop: ${err.message}`);
        // Wait 5 seconds before retrying to prevent rapid error looping
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async pollUpdates() {
    const url = `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.offset}&timeout=10`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Telegram API responded with status ${res.status}`);
    }
    const data = await res.json();
    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        this.offset = update.update_id + 1;
        await this.handleUpdate(update);
      }
    }
  }

  private async handleUpdate(update: any) {
    if (!update.message) return;
    const chat = update.message.chat;
    const text = update.message.text;
    const contact = update.message.contact;

    if (text === '/start') {
      await this.sendMessage(chat.id, {
        text: 'Assalomu alaykum! Welcome to the Yaqeen OTP service. Please share your phone number to receive OTP messages for registration or password changes.',
        reply_markup: {
          keyboard: [
            [
              {
                text: 'Register Phone Number 📱',
                request_contact: true,
              },
            ],
          ],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });
    } else if (contact) {
      let phoneNumber = contact.phone_number;
      // Normalize phone number (strip all non-digits)
      phoneNumber = phoneNumber.replace(/\D/g, '');

      // Upsert into telegram_contacts table using a transaction to avoid unique constraint violations
      try {
        await this.knex.transaction(async (trx) => {
          // Delete existing mappings for either this chat_id or this phone_number to prevent conflicts
          await trx('telegram_contacts')
            .where('chat_id', chat.id.toString())
            .del();
          await trx('telegram_contacts')
            .where('phone_number', phoneNumber)
            .del();

          // Insert new mapping
          await trx('telegram_contacts').insert({
            chat_id: chat.id.toString(),
            phone_number: phoneNumber,
            first_name: contact.first_name || null,
            last_name: contact.last_name || null,
            username: contact.username || chat.username || null,
          });

          // Check if a user record exists in the users table with this phone number
          const user = await trx('users')
            .where('phone_number', phoneNumber)
            .first();

          // Check if an employee record exists with this phone number
          const employee = await trx('employees')
            .whereRaw("regexp_replace(phone, '[^0-9]', '', 'g') = ?", [
              phoneNumber,
            ])
            .first();

          if (!user) {
            // Create a pending user account (linked to employee if found)
            await trx('users').insert({
              employee_id: employee ? employee.id : null,
              phone_number: phoneNumber,
              username: phoneNumber, // default username to phone
              password_hash: '', // no password yet
              role: 'EMPLOYEE', // default role
              status: 'Pending',
              is_active: true,
            });
          } else if (!user.employee_id && employee) {
            // Link existing employee profile if user wasn't linked yet
            await trx('users').where('id', user.id).update({
              employee_id: employee.id,
              updated_at: trx.fn.now(),
            });
          }
        });

        this.logger.log(
          `Successfully mapped Telegram chat_id ${chat.id} to phone number: +${phoneNumber}`,
        );

        await this.sendMessage(chat.id, {
          text: `Successfully registered! You can now receive OTP codes for authentication and password resets.`,
          reply_markup: {
            remove_keyboard: true,
          },
        });
      } catch (err) {
        this.logger.error(
          `Failed to register contact in database: ${err.message}`,
        );
        await this.sendMessage(chat.id, {
          text: 'Sorry, we encountered a database error registering your phone number. Please try again later.',
        });
      }
    } else {
      await this.sendMessage(chat.id, {
        text: 'Please click the button "Register Phone Number 📱" or share your contact info to register.',
      });
    }
  }

  async sendOtp(phoneNumber: string, otp: string): Promise<boolean> {
    const normalized = phoneNumber.replace(/\D/g, '');
    const contact = await this.knex('telegram_contacts')
      .where('phone_number', normalized)
      .first();

    if (!contact) {
      this.logger.warn(
        `No Telegram chat found registered for phone: +${normalized}`,
      );
      return false;
    }

    const message = `🔒 Yaqeen OTP code: ${otp}\n\nThis code is valid for 5 minutes. Do not share it with anyone.`;
    return this.sendMessage(contact.chat_id, { text: message });
  }

  /**
   * Sends a notification message to an employee via Telegram if they have a registered contact.
   */
  async sendNotificationToEmployee(
    employeeId: string,
    message: string,
  ): Promise<boolean> {
    try {
      const employee = await this.knex('employees')
        .where('id', employeeId)
        .first();
      if (!employee || !employee.phone) {
        return false;
      }
      const normalizedPhone = employee.phone.replace(/\D/g, '');
      const contact = await this.knex('telegram_contacts')
        .where('phone_number', normalizedPhone)
        .first();

      if (!contact) {
        this.logger.warn(
          `No Telegram contact found for employee ID ${employeeId} (${employee.phone})`,
        );
        return false;
      }

      return await this.sendMessage(contact.chat_id, {
        text: message,
        parse_mode: 'Markdown',
      });
    } catch (err) {
      this.logger.error(
        `Failed to send Telegram notification to employee ${employeeId}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Notifies all assigned employees about a task edition.
   */
  async sendTaskEditionNotification(params: {
    taskTitle: string;
    columnName?: string;
    dueDate?: string | Date;
    targetTime?: string | Date;
    changesSummary?: string;
    assigneeEmployeeIds: string[];
  }): Promise<void> {
    const {
      taskTitle,
      columnName,
      dueDate,
      targetTime,
      changesSummary,
      assigneeEmployeeIds,
    } = params;

    if (!assigneeEmployeeIds || assigneeEmployeeIds.length === 0) return;

    const uniqueIds = [...new Set(assigneeEmployeeIds)];
    const timeFormatted = targetTime
      ? new Date(targetTime).toLocaleString()
      : dueDate
        ? new Date(dueDate).toLocaleString()
        : 'N/A';

    const message = `📌 *Task Updated*: ${taskTitle}\n${columnName ? `*Status/Column*: ${columnName}\n` : ''}*Target Time/Due*: ${timeFormatted}\n*Details*: ${changesSummary || 'Task details edited'}`;

    for (const empId of uniqueIds) {
      await this.sendNotificationToEmployee(empId, message);
    }
  }

  /**
   * Notifies all assigned employees that task target time has been reached.
   */
  async sendTargetTimeNotification(params: {
    taskTitle: string;
    targetTime: string | Date;
    assigneeEmployeeIds: string[];
  }): Promise<void> {
    const { taskTitle, targetTime, assigneeEmployeeIds } = params;

    if (!assigneeEmployeeIds || assigneeEmployeeIds.length === 0) return;

    const uniqueIds = [...new Set(assigneeEmployeeIds)];
    const timeFormatted = new Date(targetTime).toLocaleString();

    const message = `⏰ *Target Time Reached!*\nTask "*${taskTitle}*" has reached its target completion time.\n*Target Time*: ${timeFormatted}`;

    for (const empId of uniqueIds) {
      await this.sendNotificationToEmployee(empId, message);
    }
  }

  private async sendMessage(
    chatId: string | number,
    payload: any,
  ): Promise<boolean> {
    if (!this.botToken) return false;
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          ...payload,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Telegram sendMessage failed: ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Error sending Telegram HTTP request: ${err.message}`);
      return false;
    }
  }
}
