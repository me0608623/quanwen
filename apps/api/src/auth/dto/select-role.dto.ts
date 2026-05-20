import { z } from 'zod';

export const SelectRoleSchema = z.object({
  role: z.enum(['surveyor', 'respondent']),
  displayName: z.string().min(2).max(100).optional(),
});

export type SelectRoleDto = z.infer<typeof SelectRoleSchema>;
