import {
  ClassSerializerInterceptor,
  Global,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from './filters';
import { LoggingInterceptor, ResponseInterceptor } from './interceptors';

@Global()
@Module({
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },

    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class CommonModule {}
