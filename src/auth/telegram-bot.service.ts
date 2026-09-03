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
import {
  normalizePhone,
  getPhoneVariants,
  buildPhoneMatchCondition,
} from '../common/utils/phone.utils';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private botToken: string;
  private botUsername = '';
  private isPolling = false;
  private offset = 0;

  constructor(
    private readonly configService: ConfigService,
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
  ) {
    this.botToken = this.configService.get<string>('telegramBotToken') || '';
  }

  getBotUsername(): string {
    return this.botUsername;
  }

  getBotUrl(phoneNumber?: string): string {
    const username = this.botUsername || 'YaqeenOtpBot';
    if (phoneNumber) {
      const normalized = normalizePhone(phoneNumber);
      return `https://t.me/${username}?start=reg_${normalized}`;
    }
    return `https://t.me/${username}`;
  }

  async onModuleInit() {
    if (!this.botToken) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN is not configured in the environment. Telegram bot polling will be skipped. OTP codes will be logged to console.',
      );
      return;
    }

    // Fetch bot username & details
    try {
      const meUrl = `https://api.telegram.org/bot${this.botToken}/getMe`;
      const meRes = await fetch(meUrl);
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.ok && meData.result && meData.result.username) {
          this.botUsername = meData.result.username;
          this.logger.log(
            `Telegram bot username initialized: @${this.botUsername}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`Error fetching Telegram bot profile: ${err.message}`);
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
    void this.startPolling();
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

    if (text && text.startsWith('/start')) {
      let promptText =
        'Assalomu alaykum! Welcome to the Yaqeen OTP service. Please share your phone number to receive OTP messages for registration or password changes.';

      const parts = text.split(' ');
      if (parts.length > 1) {
        const param = parts[1];
        const rawPhone = param.replace(/^reg_/, '').replace(/\D/g, '');
        if (rawPhone) {
          promptText = `Assalomu alaykum! We noticed you are registering from the Yaqeen Web App (+${rawPhone}). Please click the button "Register Phone Number 📱" below to confirm your phone number and complete registration.`;
        }
      }

      await this.sendMessage(chat.id, {
        text: promptText,
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
      const phoneNumber = normalizePhone(contact.phone_number);
      const phoneVariants = getPhoneVariants(phoneNumber);

      // Upsert into telegram_contacts table using a transaction to avoid unique constraint violations
      try {
        let employeeLinked = false;
        await this.knex.transaction(async (trx: Knex.Transaction) => {
          // Delete existing mappings for either this chat_id or this phone_number to prevent conflicts
          await trx('telegram_contacts')
            .where('chat_id', chat.id.toString())
            .del();
          await trx('telegram_contacts')
            .whereIn('phone_number', phoneVariants)
            .del();

          // Insert new mapping
          await trx('telegram_contacts').insert({
            chat_id: chat.id.toString(),
            phone_number: phoneNumber,
            first_name: contact.first_name || null,
            last_name: contact.last_name || null,
            username: contact.username || chat.username || null,
          });

          // Check if an employee record exists with this phone number or secondary phone number
          const employee = await trx('employees')
            .where((builder: any) => {
              buildPhoneMatchCondition(builder, phoneVariants);
            })
            .orderBy('is_active', 'desc')
            .first();

          if (!employee) {
            // No associated employee exists yet.
            // DO NOT create an orphaned user with employee_id = null!
            // Contact is recorded in telegram_contacts for future auto-reconciliation.
            this.logger.warn(
              `[Telegram Bot] Phone +${phoneNumber} (chat ${chat.id}) verified in Telegram, but no employee profile exists in CRM yet. Skipping users creation to prevent orphaned accounts.`,
            );
            return;
          }

          employeeLinked = true;

          // Helper to resolve role record based on user's role name
          const resolveRole = async (preferredRoleName?: string | null) => {
            const name = preferredRoleName || 'EMPLOYEE';
            const roleRec = await trx('roles')
              .whereRaw('LOWER(name) = ?', [name.toLowerCase()])
              .first();
            if (roleRec) return roleRec;
            return await trx('roles')
              .whereRaw('LOWER(name) = ?', ['employee'])
              .first();
          };

          const defaultRole = await resolveRole('EMPLOYEE');

          // Find existing user linked to this employee
          const linkedUser = await trx('users')
            .where('employee_id', employee.id)
            .first();

          // Find user by phone number
          const userByPhone = await trx('users')
            .whereIn('phone_number', phoneVariants)
            .first();

          if (linkedUser && userByPhone && linkedUser.id === userByPhone.id) {
            // Same user account: ensure phone, role, and active status are synchronized
            const resolvedRole = linkedUser.role_id
              ? null
              : await resolveRole(linkedUser.role);
            const targetRoleId = linkedUser.role_id || resolvedRole?.id || null;
            const targetRoleName =
              linkedUser.role || resolvedRole?.name || 'EMPLOYEE';
            const updatePayload: Record<string, any> = {
              phone_number: phoneNumber,
              role_id: targetRoleId,
              role: targetRoleName,
              updated_at: trx.fn.now(),
            };
            if (linkedUser.status === 'Deleted' || !linkedUser.is_active) {
              updatePayload.status = 'Pending';
              updatePayload.is_active = true;
              updatePayload.password_hash = '';
            }
            await trx('users').where('id', linkedUser.id).update(updatePayload);
          } else if (
            linkedUser &&
            userByPhone &&
            linkedUser.id !== userByPhone.id
          ) {
            // Two distinct user accounts found! Handle unique constraint conflict cleanly
            this.logger.warn(
              `[Telegram Bot Conflict] LinkedUser (${linkedUser.id}) and userByPhone (${userByPhone.id}) conflict for employee ${employee.id}. Resolving...`,
            );

            if (!userByPhone.employee_id) {
              // userByPhone is unlinked.
              if (
                userByPhone.status === 'Open' &&
                userByPhone.password_hash &&
                linkedUser.status === 'Pending' &&
                !linkedUser.password_hash
              ) {
                // User already registered and set password on userByPhone!
                // Remove empty pending linkedUser placeholder and link userByPhone to employee
                await trx('users').where('id', linkedUser.id).del();
                await trx('users')
                  .where('id', userByPhone.id)
                  .update({
                    employee_id: employee.id,
                    role_id:
                      linkedUser.role_id ||
                      userByPhone.role_id ||
                      (await resolveRole(userByPhone.role || linkedUser.role))
                        ?.id ||
                      defaultRole?.id ||
                      null,
                    role:
                      linkedUser.role ||
                      userByPhone.role ||
                      defaultRole?.name ||
                      'EMPLOYEE',
                    updated_at: trx.fn.now(),
                  });
              } else {
                // userByPhone is an orphaned placeholder: remove it so phoneNumber is freed for linkedUser
                await trx('users').where('id', userByPhone.id).del();
                const resolvedRole = linkedUser.role_id
                  ? null
                  : await resolveRole(linkedUser.role);
                const updatePayload: Record<string, any> = {
                  phone_number: phoneNumber,
                  username: phoneNumber,
                  role_id:
                    linkedUser.role_id ||
                    resolvedRole?.id ||
                    defaultRole?.id ||
                    null,
                  role:
                    linkedUser.role ||
                    resolvedRole?.name ||
                    defaultRole?.name ||
                    'EMPLOYEE',
                  updated_at: trx.fn.now(),
                };
                if (linkedUser.status === 'Deleted' || !linkedUser.is_active) {
                  updatePayload.status = 'Pending';
                  updatePayload.is_active = true;
                  updatePayload.password_hash = '';
                }
                await trx('users')
                  .where('id', linkedUser.id)
                  .update(updatePayload);
              }
            } else {
              // userByPhone is linked to another employee! Keep existing linkedUser
              this.logger.error(
                `[Telegram Bot Conflict] Phone ${phoneNumber} belongs to another employee (${userByPhone.employee_id}). Cannot reassign.`,
              );
            }
          } else if (linkedUser) {
            // Linked user exists for employee, but no other user holds this phone
            const resolvedRole = linkedUser.role_id
              ? null
              : await resolveRole(linkedUser.role);
            const updatePayload: Record<string, any> = {
              phone_number: phoneNumber,
              username:
                linkedUser.username &&
                !linkedUser.username.startsWith('998') &&
                isNaN(Number(linkedUser.username))
                  ? linkedUser.username
                  : phoneNumber,
              role_id:
                linkedUser.role_id ||
                resolvedRole?.id ||
                defaultRole?.id ||
                null,
              role:
                linkedUser.role ||
                resolvedRole?.name ||
                defaultRole?.name ||
                'EMPLOYEE',
              updated_at: trx.fn.now(),
            };
            if (linkedUser.status === 'Deleted' || !linkedUser.is_active) {
              updatePayload.status = 'Pending';
              updatePayload.is_active = true;
              updatePayload.password_hash = '';
            }
            await trx('users').where('id', linkedUser.id).update(updatePayload);
          } else if (userByPhone) {
            // User exists with this phone, but wasn't linked to this employee yet
            const resolvedRole = userByPhone.role_id
              ? null
              : await resolveRole(userByPhone.role);
            const updatePayload: Record<string, any> = {
              employee_id: employee.id,
              role_id:
                userByPhone.role_id ||
                resolvedRole?.id ||
                defaultRole?.id ||
                null,
              role:
                userByPhone.role ||
                resolvedRole?.name ||
                defaultRole?.name ||
                'EMPLOYEE',
              updated_at: trx.fn.now(),
            };
            if (userByPhone.status === 'Deleted' || !userByPhone.is_active) {
              updatePayload.status = 'Pending';
              updatePayload.is_active = true;
              updatePayload.password_hash = '';
            }
            await trx('users')
              .where('id', userByPhone.id)
              .update(updatePayload);
          } else {
            // Neither exists: create new pending user linked to the employee
            await trx('users').insert({
              employee_id: employee.id,
              phone_number: phoneNumber,
              username: phoneNumber,
              password_hash: '',
              role: defaultRole?.name || 'EMPLOYEE',
              role_id: defaultRole?.id || null,
              status: 'Pending',
              is_active: true,
            });
          }
        });

        this.logger.log(
          `Successfully mapped Telegram chat_id ${chat.id} to phone number: +${phoneNumber} (Employee linked: ${employeeLinked})`,
        );

        if (employeeLinked) {
          await this.sendMessage(chat.id, {
            text: `Successfully registered! You can now receive OTP codes for authentication and password resets.`,
            reply_markup: {
              remove_keyboard: true,
            },
          });
        } else {
          await this.sendMessage(chat.id, {
            text: `Assalomu alaykum! Your phone number (+${phoneNumber}) has been successfully verified. Once your company administrator creates your employee profile, you will be able to complete registration on the Yaqeen web platform.`,
            reply_markup: {
              remove_keyboard: true,
            },
          });
        }
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
    const variants = getPhoneVariants(phoneNumber);
    let contact = await this.knex('telegram_contacts')
      .whereIn('phone_number', variants)
      .first();

    if (!contact) {
      // Secondary phone fallback: check if phoneNumber belongs to an employee whose alternate phone has Telegram
      const employee = await this.knex('employees')
        .where((builder: any) => {
          buildPhoneMatchCondition(builder, variants);
        })
        .first();

      if (employee) {
        const empVariants: string[] = [];
        if (employee.phone)
          empVariants.push(...getPhoneVariants(employee.phone));
        if (employee.secondary_phone)
          empVariants.push(...getPhoneVariants(employee.secondary_phone));
        const uniqueEmpVariants = [...new Set(empVariants)];
        contact = await this.knex('telegram_contacts')
          .whereIn('phone_number', uniqueEmpVariants)
          .first();
      }
    }

    if (!contact) {
      this.logger.warn(
        `No Telegram chat found registered for phone: +${phoneNumber} (variants: ${variants.join(', ')})`,
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
      if (!employee || (!employee.phone && !employee.secondary_phone)) {
        return false;
      }

      const variants: string[] = [];
      if (employee.phone) {
        variants.push(...getPhoneVariants(employee.phone));
      }
      if (employee.secondary_phone) {
        variants.push(...getPhoneVariants(employee.secondary_phone));
      }
      const uniqueVariants = [...new Set(variants)];

      const contact = await this.knex('telegram_contacts')
        .whereIn('phone_number', uniqueVariants)
        .first();

      if (!contact) {
        this.logger.warn(
          `No Telegram contact found for employee ID ${employeeId} (${employee.phone || employee.secondary_phone})`,
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
