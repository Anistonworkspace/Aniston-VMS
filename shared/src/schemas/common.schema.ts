import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const UuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID — must be a UUID'),
});

export const DateRangeSchema = z.object({
  startDate: z.string().datetime({ message: 'startDate must be ISO 8601' }).optional(),
  endDate: z.string().datetime({ message: 'endDate must be ISO 8601' }).optional(),
});

export const SearchSchema = z.object({
  q: z.string().max(200).trim().optional(),
});

export const ListQuerySchema = PaginationSchema.merge(SearchSchema).merge(DateRangeSchema);

export type PaginationInput = z.infer<typeof PaginationSchema>;
export type UuidParam = z.infer<typeof UuidParamSchema>;
export type DateRangeInput = z.infer<typeof DateRangeSchema>;
export type SearchInput = z.infer<typeof SearchSchema>;
export type ListQueryInput = z.infer<typeof ListQuerySchema>;
