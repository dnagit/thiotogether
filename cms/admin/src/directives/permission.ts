import type { Directive } from 'vue';
import { useAuthStore } from '@/stores/auth';
import type { Permission } from '@cms/shared';

/** v-permission="PERMISSIONS.PAGES_CREATE" — removes the element when denied. */
export const permissionDirective: Directive<HTMLElement, Permission | Permission[]> = {
  mounted(el, binding) {
    const auth = useAuthStore();
    if (binding.value && !auth.can(binding.value)) {
      el.parentNode?.removeChild(el);
    }
  },
};
