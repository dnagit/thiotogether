import type { BaseEntity } from './api';
import type { FormFieldType } from '../constants/enums';

export interface Form extends BaseEntity {
  name: string;
  slug: string;
  description?: string | null;
  submitLabel: string;
  successMessage: string;
  /** Optional email to notify on submission. */
  notifyEmail?: string | null;
  isActive: boolean;
  fields?: FormField[];
}

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormField extends BaseEntity {
  formId: number;
  type: FormFieldType;
  name: string;
  label: string;
  placeholder?: string | null;
  helpText?: string | null;
  required: boolean;
  /** For SELECT / RADIO / CHECKBOX. */
  options: FormFieldOption[];
  /** Validation extras: min, max, minLength, maxLength, pattern, accept, maxSizeMb. */
  validation: Record<string, unknown>;
  sortOrder: number;
  /** 12-col grid width in the rendered form. */
  width: number;
}

export interface FormSubmission extends BaseEntity {
  formId: number;
  form?: Pick<Form, 'id' | 'name' | 'slug'>;
  data: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export interface SubmitFormRequest {
  data: Record<string, unknown>;
}
