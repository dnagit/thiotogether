import type { Request, Response } from 'express';
import type { BaseService } from './BaseService.js';
import { parseListQuery, paginationMeta } from '../utils/pagination.js';
import type { ApiResponse } from '@cms/shared';

export function ok<T>(res: Response, data: T, message?: string, meta?: ApiResponse['meta']): void {
  res.json({ success: true, data, message, meta } satisfies ApiResponse<T>);
}

export function created<T>(res: Response, data: T, message = 'Created'): void {
  res.status(201).json({ success: true, data, message } satisfies ApiResponse<T>);
}

/** Generic REST controller: list / get / create / update / remove. */
export abstract class BaseController<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  protected abstract readonly service: BaseService<T, TCreate, TUpdate>;

  list = async (req: Request, res: Response): Promise<void> => {
    const query = parseListQuery(req);
    const { items, total } = await this.service.list(query);
    ok(res, items, undefined, paginationMeta(query.page, query.limit, total));
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.getById(Number(req.params.id)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    created(res, await this.service.create(req.body, this.actorId(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.update(Number(req.params.id), req.body, this.actorId(req)), 'Updated');
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.remove(Number(req.params.id), this.actorId(req));
    ok(res, null, 'Deleted');
  };

  protected actorId(req: Request): number | undefined {
    return req.auth ? Number(req.auth.sub) : undefined;
  }
}
