import type { Router } from 'express';

/**
 * Feature Module contract. Every feature folder exports one of these from its
 * index.ts; `registerModules` mounts them all. Adding a feature = adding a
 * folder + one line in src/modules/index.ts. Core never changes.
 */
export interface FeatureModule {
  name: string;
  /** Mounted under /api/v1 */
  basePath: string;
  router: Router;
  /**
   * Called on SIGTERM/SIGINT, as the server stops taking connections. For modules holding
   * responses open indefinitely (event streams): end them here, or they keep the graceful
   * shutdown waiting until it is forced.
   */
  onShutdown?: () => void;
}

export function registerModules(apiRouter: Router, modules: FeatureModule[]): void {
  for (const mod of modules) {
    apiRouter.use(mod.basePath, mod.router);
  }
}
