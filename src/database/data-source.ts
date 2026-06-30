// src/database/data-source.ts
// TypeORM DataSource for CLI usage (migration:generate, migration:run, etc.)
// This file is used by ts-node-based TypeORM CLI scripts.
// For the NestJS app runtime, TypeOrmModule.forRootAsync() in app.module.ts is used instead.

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

// Load .env when running via CLI (outside NestJS DI context)
dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false,
  // For CLI: use compiled JS in dist
  entities: ['dist/database/entities/*.entity.js'],
  migrations: ['dist/database/migrations/*.js'],
  // [SECURITY] synchronize: false — ALWAYS use migrations
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
