import { z } from 'zod';
import { Router } from 'express';
import { prisma } from '../../core/database/prisma.js';
import { authenticate } from '../../core/middleware/authenticate.js';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { audit } from '../../core/middleware/audit.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { ok, created } from '../../core/base/BaseController.js';
import { NotFoundError, ValidationError } from '../../core/errors/AppError.js';
import { sendMail } from '../../core/mail/mailer.js';
import { blank } from '../../core/utils/zod.js';
import { PERMISSIONS, type FieldError } from '@cms/shared';
import type { FeatureModule } from '../../core/modules.js';

// ── Validation ──────────────────────────────────────────────
const fieldSchema = z.object({
  id: z.number().int().positive().optional(),
  type: z.enum([
    'TEXT', 'NUMBER', 'EMAIL', 'PHONE', 'DATE', 'TIME',
    'SELECT', 'RADIO', 'CHECKBOX', 'TEXTAREA', 'UPLOAD',
  ]),
  name: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(150),
  placeholder: z.string().max(150).nullish(),
  helpText: z.string().max(255).nullish(),
  required: z.boolean().default(false),
  options: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  validation: z.record(z.unknown()).default({}),
  sortOrder: z.number().int().default(0),
  width: z.number().int().min(1).max(12).default(12),
});

const formSchema = z.object({
  name: z.string().min(1).max(150),
  slug: z.string().min(1).max(150).regex(/^[a-z0-9-]+$/),
  description: blank(z.string().max(500).nullish()),
  submitLabel: z.string().max(60).default('Submit'),
  successMessage: z.string().max(500).default('Thank you!'),
  notifyEmail: blank(z.string().email().nullish()),
  isActive: z.boolean().default(true),
});

const saveFieldsSchema = z.object({ fields: z.array(fieldSchema) });

// ── Submission validation from field definitions ────────────

/** Validate a public submission against the form's field configuration. */
export function validateSubmission(fields: any[], data: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of fields) {
    const value = data[field.name];
    const empty = value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (field.required && empty) {
      errors.push({ field: field.name, message: `${field.label} is required` });
      continue;
    }
    if (empty) continue;

    const v = field.validation ?? {};
    const str = String(value);
    switch (field.type) {
      case 'EMAIL':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str))
          errors.push({ field: field.name, message: 'Invalid email address' });
        break;
      case 'PHONE':
        if (!/^[0-9+\-() ]{6,20}$/.test(str))
          errors.push({ field: field.name, message: 'Invalid phone number' });
        break;
      case 'NUMBER': {
        const n = Number(value);
        if (!Number.isFinite(n)) errors.push({ field: field.name, message: 'Must be a number' });
        else {
          if (v.min !== undefined && n < Number(v.min))
            errors.push({ field: field.name, message: `Minimum is ${v.min}` });
          if (v.max !== undefined && n > Number(v.max))
            errors.push({ field: field.name, message: `Maximum is ${v.max}` });
        }
        break;
      }
      case 'SELECT':
      case 'RADIO': {
        const allowed = (field.options as any[]).map((o) => o.value);
        if (!allowed.includes(str))
          errors.push({ field: field.name, message: 'Invalid option' });
        break;
      }
      case 'CHECKBOX': {
        const allowed = (field.options as any[]).map((o) => o.value);
        const values = Array.isArray(value) ? value : [value];
        if (values.some((val) => !allowed.includes(String(val))))
          errors.push({ field: field.name, message: 'Invalid option' });
        break;
      }
      default: {
        if (v.minLength !== undefined && str.length < Number(v.minLength))
          errors.push({ field: field.name, message: `Minimum length is ${v.minLength}` });
        if (v.maxLength !== undefined && str.length > Number(v.maxLength))
          errors.push({ field: field.name, message: `Maximum length is ${v.maxLength}` });
        if (v.pattern && !(new RegExp(String(v.pattern)).test(str)))
          errors.push({ field: field.name, message: 'Invalid format' });
      }
    }
  }
  return errors;
}

/** Drop unknown keys so nothing unexpected is persisted. */
function pickKnownFields(fields: any[], data: Record<string, unknown>): Record<string, unknown> {
  const known = new Set(fields.map((f) => f.name));
  return Object.fromEntries(Object.entries(data).filter(([k]) => known.has(k)));
}

// ── Admin routes ────────────────────────────────────────────
const router = Router();
router.use(authenticate, audit('forms'));

router.get(
  '/',
  authorize(PERMISSIONS.FORMS_VIEW),
  asyncHandler(async (_req, res) => {
    const forms = await prisma.form.findMany({
      orderBy: { id: 'desc' },
      include: { _count: { select: { fields: true, submissions: true } } },
    });
    ok(res, forms);
  }),
);

router.get(
  '/:id(\\d+)',
  authorize(PERMISSIONS.FORMS_VIEW),
  asyncHandler(async (req, res) => {
    const form = await prisma.form.findFirst({
      where: { id: Number(req.params.id) },
      include: { fields: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!form) throw new NotFoundError('Form');
    ok(res, form);
  }),
);

router.post(
  '/',
  authorize(PERMISSIONS.FORMS_MANAGE),
  validate({ body: formSchema }),
  asyncHandler(async (req, res) => created(res, await prisma.form.create({ data: req.body }))),
);

router.put(
  '/:id(\\d+)',
  authorize(PERMISSIONS.FORMS_MANAGE),
  validate({ body: formSchema.partial() }),
  asyncHandler(async (req, res) =>
    ok(res, await prisma.form.update({ where: { id: Number(req.params.id) }, data: req.body }), 'Updated'),
  ),
);

router.put(
  '/:id(\\d+)/fields',
  authorize(PERMISSIONS.FORMS_MANAGE),
  validate({ body: saveFieldsSchema }),
  asyncHandler(async (req, res) => {
    const formId = Number(req.params.id);
    const form = await prisma.form.findFirst({ where: { id: formId } });
    if (!form) throw new NotFoundError('Form');

    const keepIds = req.body.fields.filter((f: any) => f.id).map((f: any) => f.id);
    await prisma.$transaction(async (tx) => {
      await tx.formField.updateMany({
        where: { formId, id: { notIn: keepIds.length ? keepIds : [0] }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      for (const [index, field] of (req.body.fields as any[]).entries()) {
        const { id, ...rest } = field;
        const data = { ...rest, sortOrder: index, formId };
        if (id) await tx.formField.update({ where: { id }, data });
        else await tx.formField.create({ data });
      }
    });
    const fields = await prisma.formField.findMany({ where: { formId }, orderBy: { sortOrder: 'asc' } });
    ok(res, fields, 'Fields saved');
  }),
);

router.delete(
  '/:id(\\d+)',
  authorize(PERMISSIONS.FORMS_MANAGE),
  asyncHandler(async (req, res) => {
    await prisma.form.delete({ where: { id: Number(req.params.id) } });
    ok(res, null, 'Deleted');
  }),
);

// Submissions (admin)
router.get(
  '/:id(\\d+)/submissions',
  authorize(PERMISSIONS.FORM_SUBMISSIONS_VIEW),
  asyncHandler(async (req, res) => {
    const formId = Number(req.params.id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const [items, total] = await Promise.all([
      prisma.formSubmission.findMany({
        where: { formId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.formSubmission.count({ where: { formId } }),
    ]);
    ok(res, items, undefined, { page, limit, total, totalPages: Math.ceil(total / limit) || 1 });
  }),
);

router.delete(
  '/submissions/:id(\\d+)',
  authorize(PERMISSIONS.FORM_SUBMISSIONS_DELETE),
  asyncHandler(async (req, res) => {
    await prisma.formSubmission.delete({ where: { id: Number(req.params.id) } });
    ok(res, null, 'Deleted');
  }),
);

export const formsModule: FeatureModule = { name: 'forms', basePath: '/forms', router };

// ── Public submission handler (mounted by the public module) ─
export async function handlePublicSubmission(
  slug: string,
  data: Record<string, unknown>,
  meta: { ip?: string; userAgent?: string },
): Promise<{ successMessage: string }> {
  const form = await prisma.form.findFirst({
    where: { slug, isActive: true },
    include: { fields: { where: { deletedAt: null } } },
  });
  if (!form) throw new NotFoundError('Form');

  const errors = validateSubmission(form.fields, data);
  if (errors.length > 0) throw new ValidationError(errors);

  await prisma.formSubmission.create({
    data: {
      formId: form.id,
      data: pickKnownFields(form.fields, data) as any,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });

  if (form.notifyEmail) {
    const rows = form.fields
      .map((f: any) => `<tr><td><b>${f.label}</b></td><td>${escapeHtml(String(data[f.name] ?? ''))}</td></tr>`)
      .join('');
    await sendMail(
      form.notifyEmail,
      `New submission: ${form.name}`,
      `<table border="1" cellpadding="6" cellspacing="0">${rows}</table>`,
    );
  }
  return { successMessage: form.successMessage };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
