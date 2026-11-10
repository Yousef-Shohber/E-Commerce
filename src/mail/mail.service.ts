import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTP_TTL_SECONDS } from '../auth/constants/otp.constants';
import { OtpPurpose } from '../auth/enums/otp-purpose.enum';

const APP_NAME = 'Nest Shop';

export interface NotificationEmail {
  title: string;
  message: string;
}

const OTP_COPY: Record<
  OtpPurpose,
  { subject: string; title: string; message: string }
> = {
  [OtpPurpose.EMAIL_VERIFICATION]: {
    subject: `${APP_NAME}: verify your email`,
    title: 'Verify your email',
    message: 'Use the code below to verify your email address.',
  },
  [OtpPurpose.PASSWORD_RESET]: {
    subject: `${APP_NAME}: reset your password`,
    title: 'Reset your password',
    message: 'Use the code below to reset your password.',
  },
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Email a one-time code.
   * Never throws: a mail failure is logged, and the person can ask for a new
   * code. (Throwing would also tell a stranger that an email is registered,
   * for "forgot password".)
   * @param to Recipient email address
   * @param code The one-time code
   * @param purpose What the code is for, it decides the text of the email
   */
  public async sendOtp(
    to: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const copy = OTP_COPY[purpose];

    try {
      await this.mailerService.sendMail({
        to,
        subject: copy.subject,
        template: 'otp',
        context: {
          appName: APP_NAME,
          title: copy.title,
          message: copy.message,
          code,
          expiresInMinutes: OTP_TTL_SECONDS / 60,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send ${purpose} email`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Email the copy of an in-app notification.
   * Like `sendOtp`, this never throws: a mail failure is logged and must not
   * affect the business operation that triggered it.
   * @param to Recipient email address
   * @param username Recipient name for the greeting (may be empty)
   * @param notification The notification title and message
   */
  public async sendNotification(
    to: string,
    username: string | null | undefined,
    notification: NotificationEmail,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to,
        subject: `${APP_NAME}: ${notification.title}`.replace(/[\r\n]+/g, ' '),
        template: 'notification',
        context: {
          appName: APP_NAME,
          appUrl: this.config.get<string>('FRONTEND_URL') ?? null,
          name: username?.trim() || 'there',
          title: notification.title,
          message: notification.message,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to send notification email',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
