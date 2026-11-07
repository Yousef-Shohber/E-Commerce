import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from './common/decorators';

@Public()
@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('/')
  public getHome() {
    return 'E-Commerce API is running correctly. Please refer to the documentation for available endpoints.';
  }

  @Get('health')
  public async health() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('Database is not reachable');
    }

    return { status: 'ok', database: 'up' };
  }
}
