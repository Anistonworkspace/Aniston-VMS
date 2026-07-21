import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, Copy, KeyRound, Lock, ShieldOff } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@/components/ui';
import type { useToast } from '@/hooks/useToast';
import { useChangePasswordMutation, useGetCurrentUserQuery } from '@/features/auth/auth.api';
import { getApiErrorMessage } from '@/lib/apiError';
import { pageChild } from '@/lib/animations';
import { useDisableMfaMutation, useSetupMfaMutation, useVerifyMfaMutation } from './settings.api';

interface PanelProps {
  toast: ReturnType<typeof useToast>;
}

// Mirrors backend/src/modules/auth/auth.schemas.ts `changePasswordSchema`
// (currentPassword required, newPassword 8-128 chars) — confirmNewPassword
// is a client-only field, never sent to the API.
const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'At least 8 characters')
      .max(128, 'Must be under 128 characters'),
    confirmNewPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

// Mirrors backend/src/modules/auth/auth.schemas.ts `mfaCodeSchema` (6-digit TOTP code).
const mfaCodeFormSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') });
type MfaCodeFormValues = z.infer<typeof mfaCodeFormSchema>;

function PasswordCard({ toast }: PanelProps) {
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordFormSchema) });

  async function onSubmit(values: PasswordFormValues) {
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }).unwrap();
      reset();
      toast.success('Password changed', 'For your security, please sign in again.');
    } catch (err) {
      toast.error(
        'Could not change password',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  }

  return (
    <Card padding="lg">
      <CardHeader>
        <div>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing your password will sign you out everywhere.</CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            type="password"
            label="Current password"
            autoComplete="current-password"
            leftAddon={<Lock className="h-4 w-4" />}
            error={errors.currentPassword?.message}
            {...register('currentPassword')}
          />
        </div>
        <Input
          type="password"
          label="New password"
          autoComplete="new-password"
          leftAddon={<KeyRound className="h-4 w-4" />}
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <Input
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          leftAddon={<KeyRound className="h-4 w-4" />}
          error={errors.confirmNewPassword?.message}
          {...register('confirmNewPassword')}
        />
        <div className="sm:col-span-2">
          <Button type="submit" loading={isLoading}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EnableMfaFlow({ toast, onDone }: PanelProps & { onDone: () => void }) {
  const [setupMfa, { data: setup, isLoading: settingUp, error: setupError }] =
    useSetupMfaMutation();
  const [verifyMfa, { isLoading: verifying }] = useVerifyMfaMutation();
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MfaCodeFormValues>({ resolver: zodResolver(mfaCodeFormSchema) });

  async function onVerify(values: MfaCodeFormValues) {
    try {
      await verifyMfa(values).unwrap();
      toast.success('Two-factor authentication enabled');
      onDone();
    } catch (err) {
      toast.error(
        'Verification failed',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Two-factor authentication requires an authenticator app (Google Authenticator, Authy,
          1Password…).
        </p>
        {setupError && (
          <p className="text-sm text-coral">
            {getApiErrorMessage(setupError as Parameters<typeof getApiErrorMessage>[0])}
          </p>
        )}
        <Button onClick={() => setupMfa()} loading={settingUp}>
          Start setup
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted">
          Scan this in your authenticator app, or enter the key manually:
        </p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-hairline bg-card px-3 py-2">
          <code className="flex-1 truncate text-sm font-mono text-ink">{setup.secret}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(setup.secret);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="shrink-0 rounded-md p-1.5 text-muted hover:bg-surface hover:text-muted"
            aria-label="Copy secret key"
          >
            {copied ? <Check className="h-4 w-4 text-state-success" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-2 break-all text-xs text-muted">{setup.otpauthUrl}</p>
      </div>
      <form onSubmit={handleSubmit(onVerify)} className="flex items-end gap-3">
        <Input
          label="Verification code"
          placeholder="000000"
          inputMode="numeric"
          maxLength={6}
          error={errors.code?.message}
          {...register('code')}
        />
        <Button type="submit" loading={verifying}>
          Verify &amp; enable
        </Button>
      </form>
    </div>
  );
}

function DisableMfaFlow({ toast, onDone }: PanelProps & { onDone: () => void }) {
  const [disableMfa, { isLoading }] = useDisableMfaMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MfaCodeFormValues>({ resolver: zodResolver(mfaCodeFormSchema) });

  async function onSubmit(values: MfaCodeFormValues) {
    try {
      await disableMfa(values).unwrap();
      toast.success('Two-factor authentication disabled');
      onDone();
    } catch (err) {
      toast.error(
        'Could not disable MFA',
        getApiErrorMessage(err as Parameters<typeof getApiErrorMessage>[0])
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex items-end gap-3">
      <Input
        label="Enter your current code to confirm"
        placeholder="000000"
        inputMode="numeric"
        maxLength={6}
        error={errors.code?.message}
        {...register('code')}
      />
      <Button
        type="submit"
        variant="danger"
        loading={isLoading}
        leftIcon={<ShieldOff className="h-4 w-4" />}
      >
        Disable
      </Button>
    </form>
  );
}

function MfaCard({ toast }: PanelProps) {
  const { data: user, isLoading } = useGetCurrentUserQuery();
  const [flowOpen, setFlowOpen] = useState(false);

  return (
    <Card padding="lg">
      <CardHeader>
        <div>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>Add an extra layer of security to your account.</CardDescription>
        </div>
        {!isLoading && user && (
          <Badge variant={user.mfaEnabled ? 'success' : 'default'}>
            {user.mfaEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        )}
      </CardHeader>

      {isLoading || !user ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !user.mfaEnabled && !flowOpen ? (
        <Button variant="secondary" onClick={() => setFlowOpen(true)}>
          Enable two-factor authentication
        </Button>
      ) : !user.mfaEnabled && flowOpen ? (
        <EnableMfaFlow toast={toast} onDone={() => setFlowOpen(false)} />
      ) : user.mfaEnabled && !flowOpen ? (
        <Button variant="outline" onClick={() => setFlowOpen(true)}>
          Disable two-factor authentication
        </Button>
      ) : (
        <DisableMfaFlow toast={toast} onDone={() => setFlowOpen(false)} />
      )}
    </Card>
  );
}

export function SecurityPanel({ toast }: PanelProps) {
  return (
    <motion.div variants={pageChild} className="space-y-6">
      <div className="flex items-start gap-2 rounded-xl border border-state-warning bg-state-warning-soft px-4 py-3 text-sm text-state-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Changing your password immediately invalidates your session — you&apos;ll need to sign in
          again.
        </span>
      </div>
      <PasswordCard toast={toast} />
      <MfaCard toast={toast} />
    </motion.div>
  );
}

export default SecurityPanel;
