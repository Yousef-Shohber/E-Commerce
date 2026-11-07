import { MailerService } from '@nestjs-modules/mailer';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  /**
   * @param email of register user
   * @param link with id and verification token
   */
  public async sendVerificationToken(email: string, link: string) {
    await this.send(email, 'Verification', 'verification-token', { link });
  }

  /**
   *  Reset Password
   * @param email
   * @param resetPasswordlink
   */
  public async sendResetPassword(email: string, resetPasswordlink: string) {
    await this.send(email, 'Reset Password', 'reset-password', {
      resetPasswordlink,
    });
  }

  private async send(
    to: string,
    subject: string,
    template: string,
    context: Record<string, string>,
  ) {
    try {
      await this.mailerService.sendMail({ to, subject, template, context });
    } catch (error) {
      this.logger.error(
        `Failed to send "${subject}" email`,
        error instanceof Error ? error.message : String(error),
      );
      throw new ServiceUnavailableException(
        'Could not send the email, please try again later',
      );
    }
  }
}
