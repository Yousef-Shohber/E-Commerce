import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { OTP_TTL_SECONDS } from '../auth/constants/otp.constants';
import { OtpPurpose } from '../auth/enums/otp-purpose.enum';

const APP_NAME = 'Nest Shop';

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

  constructor(private readonly mailerService: MailerService) {}

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
}
