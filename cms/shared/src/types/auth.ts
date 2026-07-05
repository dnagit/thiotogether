import type { BaseEntity } from './api';
import type { Permission } from '../constants/permissions';

export interface Role extends BaseEntity {
  name: string;
  displayName: string;
  description?: string | null;
  permissions?: Permission[];
}

export interface User extends BaseEntity {
  email: string;
  name: string;
  avatarUrl?: string | null;
  isActive: boolean;
  roleId: number;
  role?: Role;
  lastLoginAt?: string | null;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: string;
  permissions: Permission[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  permissions: Permission[];
  type: 'access' | 'refresh';
}
