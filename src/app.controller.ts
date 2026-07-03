import { Controller, Get } from '@nestjs/common';
import { AppService, HealthResult } from './app.service';
import { Public } from './common/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Public()
  async getHealth(): Promise<HealthResult> {
    return this.appService.getHealth();
  }
}
