import { NotFoundError } from '../errors/AppError.js';
import type { BaseRepository, FindAllResult } from './BaseRepository.js';
import type { ParsedListQuery } from '../utils/pagination.js';

/**
 * Generic service delegating CRUD to a repository. Subclasses override the
 * hooks (beforeCreate/afterUpdate/…) or full methods to add business rules —
 * the controller layer never talks to repositories directly.
 */
export abstract class BaseService<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  protected abstract readonly repository: BaseRepository<T, TCreate, TUpdate>;
  protected abstract readonly resourceName: string;

  async list(query: ParsedListQuery): Promise<FindAllResult<T>> {
    return this.repository.findAll(query);
  }

  async getById(id: number): Promise<T> {
    const item = await this.repository.findById(id);
    if (!item) throw new NotFoundError(this.resourceName);
    return item;
  }

  async create(data: TCreate, actorId?: number): Promise<T> {
    const prepared = await this.beforeCreate(data, actorId);
    const created = await this.repository.create(prepared);
    await this.afterCreate(created, actorId);
    return created;
  }

  async update(id: number, data: TUpdate, actorId?: number): Promise<T> {
    await this.getById(id);
    const prepared = await this.beforeUpdate(id, data, actorId);
    const updated = await this.repository.update(id, prepared);
    await this.afterUpdate(updated, actorId);
    return updated;
  }

  async remove(id: number, actorId?: number): Promise<void> {
    await this.getById(id);
    await this.beforeDelete(id, actorId);
    await this.repository.delete(id);
  }

  // Hooks — default no-ops.
  protected async beforeCreate(data: TCreate, _actorId?: number): Promise<TCreate> {
    return data;
  }
  protected async afterCreate(_entity: T, _actorId?: number): Promise<void> {}
  protected async beforeUpdate(_id: number, data: TUpdate, _actorId?: number): Promise<TUpdate> {
    return data;
  }
  protected async afterUpdate(_entity: T, _actorId?: number): Promise<void> {}
  protected async beforeDelete(_id: number, _actorId?: number): Promise<void> {}
}
