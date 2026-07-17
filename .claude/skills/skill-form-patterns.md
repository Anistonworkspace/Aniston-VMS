# Skill — Form Patterns

React Hook Form + Zod + RTK Query — the complete pattern for every form type.

---

## Simple create form (standard pattern)

```typescript
// frontend/src/features/item/CreateItemModal.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateItemSchema, type CreateItemInput } from '@boilerplate/shared';
import { useCreateItemMutation } from './itemApi';
import { toast } from '@/hooks/useToast';
import { getErrorMessage } from '@/lib/errorMessages';

interface Props { open: boolean; onClose: () => void; }

export function CreateItemModal({ open, onClose }: Props) {
  const [create, { isLoading }] = useCreateItemMutation();

  const form = useForm<CreateItemInput>({
    resolver: zodResolver(CreateItemSchema),
    defaultValues: { type: 'MEDIUM', startDate: '', endDate: '', reason: '' },
  });

  const onSubmit = async (data: CreateItemInput) => {
    try {
      await create(data).unwrap();
      toast.success('Item created');
      form.reset();
      onClose();
    } catch (err) {
      // Map server-side field errors to form
      const fields = (err as any)?.data?.error?.fields;
      if (fields) {
        Object.entries(fields).forEach(([key, errors]) =>
          form.setError(key as any, { message: (errors as string[])[0] })
        );
        return;
      }
      toast.error(getErrorMessage(err));
    }
  };

  if (!open) return null;

  return (
    <div className="detail-modal-backdrop fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="floating-card rounded-[var(--card-radius)] w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-semibold text-[var(--primary-text-color)]">New Item</h2>
          <button className="btn btn--ghost btn--icon" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-[var(--secondary-text-color)] mb-1">Type</label>
            <select className="input-field" {...form.register('type')}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
            {form.formState.errors.type && (
              <p className="text-xs text-[var(--negative-color)] mt-1">{form.formState.errors.type.message}</p>
            )}
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--secondary-text-color)] mb-1">Start date</label>
              <input type="date" className="input-field" {...form.register('startDate')} />
              {form.formState.errors.startDate && (
                <p className="text-xs text-[var(--negative-color)] mt-1">{form.formState.errors.startDate.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--secondary-text-color)] mb-1">End date</label>
              <input type="date" className="input-field" {...form.register('endDate')} />
              {form.formState.errors.endDate && (
                <p className="text-xs text-[var(--negative-color)] mt-1">{form.formState.errors.endDate.message}</p>
              )}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-[var(--secondary-text-color)] mb-1">Reason</label>
            <textarea className="input-field min-h-[80px] resize-none" rows={3} {...form.register('reason')} />
            {form.formState.errors.reason && (
              <p className="text-xs text-[var(--negative-color)] mt-1">{form.formState.errors.reason.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn btn--secondary btn--md" onClick={onClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className="btn btn--primary btn--md" disabled={isLoading}>
              {isLoading ? <span className="animate-spin">⟳</span> : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## Edit form — pre-populate with existing data

```typescript
interface EditProps { record: Item; open: boolean; onClose: () => void; }

export function EditItemModal({ record, open, onClose }: EditProps) {
  const [update, { isLoading }] = useUpdateItemMutation();

  const form = useForm<UpdateItemInput>({
    resolver: zodResolver(UpdateItemSchema),
    // Pre-populate EVERY field from the existing record
    values: {
      type:      record.type,
      startDate: record.startDate,
      endDate:   record.endDate,
      reason:    record.reason ?? '',
    },
  });

  // IMPORTANT: reset form when modal closes to prevent stale state on next open
  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  const onSubmit = async (data: UpdateItemInput) => {
    try {
      await update({ id: record.id, ...data }).unwrap();
      toast.success('Item updated');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  // ... rest is same as CreateItemModal
}
```

---

## Multi-step form

```typescript
import { useState } from 'react';

const STEPS = ['Details', 'Dates', 'Review'] as const;
type Step = typeof STEPS[number];

export function MultiStepItemForm() {
  const [step, setStep] = useState<Step>('Details');
  const form = useForm<CreateItemInput>({ resolver: zodResolver(CreateItemSchema) });

  const stepIndex = STEPS.indexOf(step);

  const goNext = async () => {
    // Validate only the fields relevant to the current step
    const fieldsToValidate: (keyof CreateItemInput)[][] = [
      ['type', 'reason'],
      ['startDate', 'endDate'],
    ];
    const valid = await form.trigger(fieldsToValidate[stepIndex]);
    if (valid) setStep(STEPS[stepIndex + 1]);
  };

  return (
    <div>
      {/* Step indicator */}
      <div className="tabs-compact mb-6">
        {STEPS.map((s, i) => (
          <button key={s} className={`tab-trigger-compact ${step === s ? 'tab-trigger-compact--active' : ''}`}
            disabled={i > stepIndex} onClick={() => i < stepIndex && setStep(s)}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)}>
        {step === 'Details' && <DetailsStep form={form} />}
        {step === 'Dates'   && <DatesStep   form={form} />}
        {step === 'Review'  && <ReviewStep  form={form} />}

        <div className="flex gap-3 mt-6">
          {stepIndex > 0 && <button type="button" className="btn btn--secondary btn--md" onClick={() => setStep(STEPS[stepIndex - 1])}>Back</button>}
          {step !== 'Review'
            ? <button type="button" className="btn btn--primary btn--md" onClick={goNext}>Next</button>
            : <button type="submit" className="btn btn--primary btn--md">Submit</button>
          }
        </div>
      </form>
    </div>
  );
}
```

---

## Field array — dynamic rows (e.g. add multiple items)

```typescript
import { useFieldArray } from 'react-hook-form';

function AttachmentArrayField({ control }: { control: Control<FormInput> }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'attachments' });

  return (
    <div className="space-y-2">
      {fields.map((field, index) => (
        <div key={field.id} className="flex gap-2 items-center">
          <input className="input-field flex-1" placeholder="Attachment URL" {...control.register(`attachments.${index}.url`)} />
          <input className="input-field w-40"    placeholder="Label"         {...control.register(`attachments.${index}.label`)} />
          <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => remove(index)}>✕</button>
        </div>
      ))}
      <button type="button" className="btn btn--secondary btn--sm" onClick={() => append({ url: '', label: '' })}>
        + Add attachment
      </button>
    </div>
  );
}
```

---

## File input in a form

```typescript
// Register file input separately — not with {...register()} for file inputs
const [filePreview, setFilePreview] = useState<string | null>(null);
const fileRef = form.register('document');

<input
  type="file"
  accept=".pdf,.jpg,.jpeg,.png"
  className="hidden"
  id="file-upload"
  {...fileRef}
  onChange={(e) => {
    fileRef.onChange(e);  // let RHF track the value
    const file = e.target.files?.[0];
    if (file) setFilePreview(URL.createObjectURL(file));
  }}
/>
<label htmlFor="file-upload" className="btn btn--secondary btn--sm cursor-pointer">
  Upload document
</label>
{filePreview && <img src={filePreview} className="h-16 w-16 object-cover rounded-md mt-2" />}
```

---

## Reusable FormField wrapper component

```typescript
// frontend/src/components/ui/FormField.tsx
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}

export function FormField({ label, error, required, children, hint }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--secondary-text-color)] mb-1">
        {label} {required && <span className="text-[var(--negative-color)]">*</span>}
      </label>
      {children}
      {hint  && !error && <p className="text-xs text-[var(--text-tertiary)] mt-1">{hint}</p>}
      {error && <p className="text-xs text-[var(--negative-color)] mt-1">{error}</p>}
    </div>
  );
}
```

---

## Zod schema patterns

```typescript
// shared/src/schemas/item.schema.ts
import { z } from 'zod';

export const CreateItemSchema = z.object({
  type:      z.enum(['LOW', 'MEDIUM', 'HIGH']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  reason:    z.string().min(10, 'Reason must be at least 10 characters').max(500),
  documentUrl: z.string().url().optional(),
}).refine(
  (d) => new Date(d.endDate) >= new Date(d.startDate),
  { message: 'End date must be on or after start date', path: ['endDate'] }
);

export const UpdateItemSchema = CreateItemSchema.partial();

export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
```

---

## Checklist

- [ ] Schema defined in `shared/src/schemas/` and used by BOTH frontend (`zodResolver`) and backend (`z.parse`)
- [ ] Edit modal uses `values:` (not `defaultValues:`) so form updates when record prop changes
- [ ] Edit modal resets on close — `useEffect(() => { if (!open) form.reset(); }, [open])`
- [ ] Submit button `disabled={isLoading}` — no double-submission
- [ ] Every field has a visible error message below it
- [ ] Server-side field errors mapped to `form.setError()` — not just a toast
- [ ] File inputs use `onChange` wrapper, not just `{...register()}`
- [ ] Multi-step forms validate per-step with `form.trigger(fields)`
- [ ] Cross-field validation uses `.refine()` with correct `path`
