import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getDataSourceToken } from '@nestjs/typeorm';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: getDataSourceToken(),
          useValue: { query: jest.fn().mockResolvedValue([{ '1': 1 }]) },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: { ping: jest.fn().mockResolvedValue('PONG') },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return health status with all connected', async () => {
      const result = await appController.getHealth();
      expect(result).toEqual(
        expect.objectContaining({
          status: 'ok',
          database: 'connected',
          redis: 'connected',
        }),
      );
    });
  });
});
