import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { join } from 'node:path';
import { EjsAdapter } from '@nestjs-modules/mailer/adapters/ejs.adapter';

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const port = config.getOrThrow<number>('SMTP_PORT');
        const user = config.get<string>('SMTP_USERNAME');

        return {
          transport: {
            host: config.getOrThrow<string>('SMTP_HOST'),
            port,
            secure: port === 465,
            ...(user
              ? { auth: { user, pass: config.get<string>('SMTP_PASSWORD') } }
              : {}),
          },

          defaults: { from: config.get<string>('MAIL_FROM') ?? user },

          template: {
            dir: join(__dirname, 'templates'),
            adapter: new EjsAdapter({
              inlineCssEnabled: true,
            }),
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
