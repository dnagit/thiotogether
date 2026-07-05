import { defineAsyncComponent, type Component } from 'vue';

/**
 * Self-registering block registry.
 *
 * Every .vue file in components/blocks/ named <PascalCase>Block.vue is
 * automatically available to the renderer under its kebab-case type:
 *   HeroBlock.vue        → 'hero'
 *   RichTextBlock.vue    → 'rich-text'
 *   GoogleMapBlock.vue   → 'google-map'
 *
 * Adding a new block = adding one file. Nothing else changes.
 */
const modules = import.meta.glob('../components/blocks/*Block.vue');

function fileToType(path: string): string {
  const name = path.split('/').pop()!.replace(/Block\.vue$/, '');
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const registry = new Map<string, Component>();
for (const [path, loader] of Object.entries(modules)) {
  registry.set(fileToType(path), defineAsyncComponent(loader as any));
}

export function resolveBlock(type: string): Component | null {
  return registry.get(type) ?? null;
}

export const registeredBlockTypes = [...registry.keys()];
