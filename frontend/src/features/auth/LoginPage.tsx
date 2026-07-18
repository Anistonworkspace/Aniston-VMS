import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Cctv, Eye, EyeOff, KeyRound, ShieldAlert, Wand2 } from 'lucide-react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';
import { Button, Input } from '@/components/ui';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/apiError';
import { pageTransition } from '@/lib/animations';
import { useAppSelector } from '@/hooks/useAppStore';
import { useLoginMutation } from './auth.api';
import type { LoginInput } from './auth.types';

// Seeded by the backend demo dataset — see .claude/docs/04-uiux-brief.md.
const DEMO_EMAIL = 'admin@anistonvms.example';
const DEMO_PASSWORD = 'AdminDemo2026!';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().optional(),
});
type LoginFormValues = z.infer<typeof loginSchema>;

interface LocationState {
  from?: { pathname: string };
}

// Aniston VMS sign-in — docs/actual-design.png has no login mockup, so this
// mirrors the app's own soft-SaaS canon (cream canvas, dark brand panel,
// white elevated card) rather than inventing a new style. Access token +
// user are held in memory only (features/auth/auth.slice.ts) — never
// localStorage/sessionStorage.
export function LoginPage(): JSX.Element {
  const [login, { isLoading }] = useLoginMutation();
  const [mfaRequired, setMfaRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const accessToken = useAppSelector((s) => s.auth.accessToken);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', mfaCode: '' },
  });

  // Already signed in (e.g. back button after login) — bounce straight past.
  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  const from = (location.state as LocationState | null)?.from?.pathname ?? '/';

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setFormError(null);

    if (mfaRequired && !/^\d{6}$/.test(values.mfaCode ?? '')) {
      setError('mfaCode', { message: 'Enter the 6-digit code from your authenticator app' });
      return;
    }

    const payload: LoginInput = values.mfaCode
      ? { email: values.email, password: values.password, mfaCode: values.mfaCode }
      : { email: values.email, password: values.password };

    try {
      const result = await login(payload).unwrap();
      toast.success(`Welcome back, ${result.user.name.split(' ')[0]}`);
      navigate(from, { replace: true });
    } catch (err) {
      const apiErr = err as FetchBaseQueryError | SerializedError;
      const code = getApiErrorCode(apiErr);
      if (code === 'MFA_REQUIRED') {
        setMfaRequired(true);
        toast('Enter the 6-digit code from your authenticator app', { icon: '🔐' });
        return;
      }
      if (code === 'MFA_INVALID') {
        setError('mfaCode', { message: 'Invalid code — try again' });
        return;
      }
      setFormError(getApiErrorMessage(apiErr));
    }
  }

  function fillDemoCredentials(): void {
    setValue('email', DEMO_EMAIL, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Brand panel */}
      <div className="relative hidden w-[420px] shrink-0 flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-sage">
            <Cctv size={18} strokeWidth={1.5} className="text-white" />
          </span>
          <span className="font-heading text-lg font-semibold text-white">Aniston VMS</span>
        </div>
        <div>
          <p className="font-heading text-2xl font-semibold leading-snug text-white">
            Every camera. Every zone.
            <br />
            One calm command center.
          </p>
          <p className="mt-3 max-w-sm text-sm text-sidebar-muted">
            Monitor live feeds, triage incidents, and keep every site healthy from a single
            dashboard.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">© {new Date().getFullYear()} Aniston VMS</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={reduceMotion ? false : 'hidden'}
          animate="visible"
          variants={pageTransition}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex flex-col items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-sage">
              <Cctv size={18} strokeWidth={1.5} className="text-white" />
            </span>
            <span className="font-heading text-lg font-semibold text-ink">Aniston VMS</span>
          </div>

          <div className="rounded-card border border-hairline bg-card p-8 shadow-soft">
            <h1 className="font-heading text-xl font-semibold text-ink">Sign in</h1>
            <p className="mt-1 text-sm text-muted">
              Welcome back — enter your credentials to continue.
            </p>

            {formError && (
              <div className="mt-5 flex items-start gap-2 rounded-control border border-hairline bg-coral-soft px-3.5 py-2.5 text-sm text-coral">
                <ShieldAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
              <Input
                type="email"
                label="Email"
                autoComplete="username"
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email')}
              />
              <Input
                type={showPassword ? 'text' : 'password'}
                label="Password"
                autoComplete="current-password"
                placeholder="••••••••"
                error={errors.password?.message}
                rightAddon={
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
                {...register('password')}
              />
              {mfaRequired && (
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  label="Authenticator code"
                  placeholder="123456"
                  hint="Enter the 6-digit code from your authenticator app"
                  error={errors.mfaCode?.message}
                  autoFocus
                  maxLength={6}
                  leftAddon={<KeyRound size={16} />}
                  {...register('mfaCode')}
                />
              )}

              <Button type="submit" className="w-full" loading={isLoading}>
                Sign in
              </Button>
            </form>

            <button
              type="button"
              onClick={fillDemoCredentials}
              className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-hairline py-2 text-xs font-medium text-muted transition-colors duration-150 hover:text-ink"
            >
              <Wand2 size={14} strokeWidth={1.5} />
              Use demo credentials
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
