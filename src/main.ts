// src/main.ts
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor.js';
import { setupSwagger } from './common/swagger.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // [SECURITY] HTTP Security Headers
  app.use(helmet());

  // [SECURITY] CORS – hanya izinkan origin frontend terdaftar
  app.enableCors({
    origin:
      process.env.FRONTEND_URL?.split(',').map((origin) => origin.trim()) ?? [],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // [SECURITY] Request body size limit – cegah payload besar
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // [SECURITY] Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global Exception Filter – sanitize stack trace di production
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Interceptors (order matters: logging → transform → serializer)
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseTransformInterceptor(),
    new ClassSerializerInterceptor(reflector),
  );

  // API Versioning Prefix
  app.setGlobalPrefix('api/v1');

  // Swagger Docs
  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
