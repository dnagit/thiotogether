import { defineStore } from 'pinia';
import { http, setAccessToken } from '@/api/http';
import { router } from '@/router';
import { RoleName, type ApiResponse, type AuthUser, type LoginResponse, type Permission } from '@cms/shared';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null as string | null,
    user: null as AuthUser | null,
    initialized: false,
  }),

  getters: {
    isAuthenticated: (s) => !!s.user,
    can: (s) => (permission: Permission | Permission[]): boolean => {
      if (!s.user) return false;
      if (s.user.role === RoleName.SUPER_ADMIN) return true;
      const required = Array.isArray(permission) ? permission : [permission];
      return required.every((p) => s.user!.permissions.includes(p));
    },
  },

  actions: {
    async login(email: string, password: string): Promise<void> {
      const { data } = await http.post<ApiResponse<LoginResponse>>('/auth/login', { email, password });
      this.accessToken = data.data.accessToken;
      this.user = data.data.user;
      setAccessToken(this.accessToken);
    },

    /** Restore session on app boot using the refresh cookie. */
    async init(): Promise<void> {
      if (this.initialized) return;
      this.initialized = true;
      try {
        const { data } = await http.post<ApiResponse<{ accessToken: string }>>('/auth/refresh');
        this.accessToken = data.data.accessToken;
        setAccessToken(this.accessToken);
        const me = await http.get<ApiResponse<AuthUser>>('/auth/me');
        this.user = me.data.data;
      } catch {
        this.accessToken = null;
        this.user = null;
        setAccessToken(null);
      }
    },

    async logout(): Promise<void> {
      try {
        await http.post('/auth/logout');
      } finally {
        this.forceLogout();
      }
    },

    forceLogout(): void {
      this.accessToken = null;
      this.user = null;
      setAccessToken(null);
      void router.push({ name: 'login' });
    },
  },
});

// Keep the axios token in sync when the store hydrates.
export function syncToken(): void {
  const store = useAuthStore();
  setAccessToken(store.accessToken);
}
