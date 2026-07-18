import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  mfaCode: z
    .string()
    .regex(/^\d{6}$/, 'MFA code must be 6 digits')
    .optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'MFA code must be 6 digits'),
});
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
