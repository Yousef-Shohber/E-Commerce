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
        const username = config.get<string>('SMTP_USERNAME') ?? '';

        return {
          transport: {
            host: config.get<string>('SMTP_HOST'),
            port: config.get<number>('SMTP_PORT'),
            secure: false,
            auth: {
              user: username,
              pass: config.get<string>('SMTP_PASSWORD'),
            },
          },

          defaults: { from: config.get<string>('MAIL_FROM') },

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
