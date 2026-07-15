import { z, ZodError } from 'zod';

export const formatZodIssues = (error: ZodError) => {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
};

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  role_id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
});

export const timerStartSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  task_description: z.string().min(1, 'Task description is required').max(500),
  notes: z.string().max(2000).optional(),
  is_billable: z.boolean().optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
});

export const timerManualSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  task_description: z.string().min(1, 'Task description is required').max(500),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  notes: z.string().max(2000).optional(),
  is_billable: z.boolean().optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
});

export const projectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  budget_hours: z.number().int().positive().optional(),
  budget_amount: z.number().positive().optional(),
  is_active: z.boolean().optional(),
});

export const organizationCreateSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  billing_email: z.string().email().optional(),
});

export const passwordResetSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(1, 'Reset code is required'),
  // Hard floor only — the org password policy (default min 12) provides the
  // effective minimum, enforced in the controller via passwordPolicyService.
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// Used by the Admin "Create User" endpoint — enforces the same floor as self-registration.
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  // role or role_id — controller resolves whichever is present.
  role: z.string().optional(),
  role_id: z.string().uuid().optional(),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  team_name: z.string().optional(),
  hourly_rate: z.number().nonnegative().optional(),
  // Worker classification — independent of access role. Drives min weekly hours.
  employment_type: z.enum(['employee', 'intern', 'contractor']).optional(),
  min_weekly_hours: z.number().int().min(0).max(168).nullable().optional(),
}).refine((d) => d.role || d.role_id, { message: 'role or role_id is required', path: ['role'] });

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const dateRangeSchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});
