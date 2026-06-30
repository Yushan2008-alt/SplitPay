import { Injectable, NotFoundException } from '@nestjs/common';
import { FindManyOptions, FindOptionsWhere, In, Repository } from 'typeorm';
import { BaseEntity } from '../entities/base.entity.js';

@Injectable()
export abstract class BaseRepository<T extends BaseEntity> {
  constructor(protected readonly repo: Repository<T>) {}

  async findById(id: string): Promise<T | null> {
    return this.repo.findOne({ where: { id } as FindOptionsWhere<T> });
  }

  async findByIdOrFail(id: string): Promise<T> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new NotFoundException(`${this.repo.metadata.name} with id ${id} not found`);
    }
    return entity;
  }

  async findByIds(ids: string[]): Promise<T[]> {
    return this.repo.find({ where: { id: In(ids) } as FindOptionsWhere<T> });
  }

  async exists(id: string): Promise<boolean> {
    return this.repo.exists({ where: { id } as FindOptionsWhere<T> });
  }

  async findAll(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repo.find(options);
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repo.count({ where });
  }

  async createEntity(data: Partial<T>): Promise<T> {
    const entity = this.repo.create(data as T);
    return this.repo.save(entity);
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const entity = await this.findByIdOrFail(id);
    Object.assign(entity, data);
    return this.repo.save(entity);
  }

  async hardDelete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async softDelete(id: string): Promise<void> {
    const hasDeleteColumn = this.repo.metadata.columns.some(
      (col) => col.propertyName === 'deletedAt',
    );
    if (hasDeleteColumn) {
      await this.repo.softDelete(id);
    } else {
      await this.hardDelete(id);
    }
  }
}
