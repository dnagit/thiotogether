import { prisma } from '../database/prisma.js';
import type { ParsedListQuery } from '../utils/pagination.js';

export interface FindAllResult<T> {
  items: T[];
  total: number;
}

/**
 * Generic repository over a Prisma model delegate.
 * Soft delete + deleted-row filtering are handled globally by the Prisma
 * extension, so subclasses only add domain-specific queries.
 *
 * `searchFields` powers ?search= (OR contains), `filterableFields` whitelists
 * ?field=value equality filters, `sortableFields` whitelists ?sortBy=.
 */
export abstract class BaseRepository<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  protected abstract readonly modelName: string;
  protected searchFields: string[] = [];
  protected filterableFields: string[] = [];
  protected sortableFields: string[] = ['id', 'createdAt', 'updatedAt', 'sortOrder'];
  protected defaultInclude: Record<string, unknown> | undefined;
  protected defaultOrderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' };

  protected get model(): any {
    return (prisma as any)[this.modelName];
  }

  async findAll(query: ParsedListQuery, extraWhere: Record<string, unknown> = {}): Promise<FindAllResult<T>> {
    const where = { ...this.buildWhere(query), ...extraWhere };
    const orderBy =
      query.sortBy && this.sortableFields.includes(query.sortBy)
        ? { [query.sortBy]: query.sortOrder }
        : this.defaultOrderBy;

    const [items, total] = await Promise.all([
      this.model.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.take,
        include: this.defaultInclude,
      }),
      this.model.count({ where }),
    ]);
    return { items, total };
  }

  async findById(id: number, include?: Record<string, unknown>): Promise<T | null> {
    return this.model.findFirst({ where: { id }, include: include ?? this.defaultInclude });
  }

  async findOne(where: Record<string, unknown>): Promise<T | null> {
    return this.model.findFirst({ where, include: this.defaultInclude });
  }

  async create(data: TCreate): Promise<T> {
    return this.model.create({ data, include: this.defaultInclude });
  }

  async update(id: number, data: TUpdate): Promise<T> {
    return this.model.update({ where: { id }, data, include: this.defaultInclude });
  }

  /** Soft delete (converted by the Prisma extension). */
  async delete(id: number): Promise<T> {
    return this.model.delete({ where: { id } });
  }

  async count(where: Record<string, unknown> = {}): Promise<number> {
    return this.model.count({ where });
  }

  protected buildWhere(query: ParsedListQuery): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (query.search && this.searchFields.length > 0) {
      where.OR = this.searchFields.map((field) => ({ [field]: { contains: query.search } }));
    }
    for (const [key, value] of Object.entries(query.filters)) {
      if (!this.filterableFields.includes(key)) continue;
      where[key] = coerce(value);
    }
    return where;
  }
}

function coerce(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}
