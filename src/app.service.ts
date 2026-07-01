import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: string; database: string; redis: string; timestamp: string } {
    return {
      status: 'ok',
      database: 'configured',
      redis: 'configured',
      timestamp: new Date().toISOString(),
    };
  }
}
