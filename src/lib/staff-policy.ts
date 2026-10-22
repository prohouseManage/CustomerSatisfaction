import { z } from 'zod';
export type StaffRole = 'ADMIN' | 'MANAGER';
export const roleLabels: Record<StaffRole, string> = {
  ADMIN: 'Administrateur',
  MANAGER: 'Manager',
};
export const invitationSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().max(100).default(''),
    role: z.enum(['ADMIN', 'MANAGER']).default('MANAGER'),
  })
  .strict();
export const acceptInvitationSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    name: z.string().trim().min(2).max(100),
    password: z
      .string()
      .min(12, 'Utilisez au moins 12 caractères.')
      .max(72)
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        'Le mot de passe doit contenir au maximum 72 octets.',
      ),
  })
  .strict();
export const memberUpdateSchema = z
  .object({
    role: z.enum(['ADMIN', 'MANAGER']).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.role !== undefined || value.enabled !== undefined,
    'Aucun changement fourni.',
  );
export const INVITATION_DAYS = 7;
