// src/worker.ts
// Separate entry point for BullMQ worker processes.
// PROCESS_ROLE=worker starts this instead of the HTTP server.
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  const logger = new Logger('WorkerBootstrap');
  logger.log('Starting worker process...');

  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Enable graceful shutdown
  app.enableShutdownHooks();

  const signals = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      logger.log(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }

  logger.log('Worker process is running and listening for jobs');
}

void bootstrap();
