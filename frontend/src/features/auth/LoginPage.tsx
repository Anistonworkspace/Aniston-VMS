import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Cctv, Eye, EyeOff, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';
import { getApiErrorCode, getApiErrorMessage } from '@/lib/apiError';
import { pageTransition } from '@/lib/animations';
import { useAppSelector } from '@/hooks/useAppStore';
import { cn } from '@/lib/utils';
import { useLoginMutation } from './auth.api';
import type { LoginInput } from './auth.types';
import { LoginIllustration } from './LoginIllustration';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().optional(),
});
type LoginFormValues = z.infer<typeof loginSchema>;

interface LocationState {
  from?: { pathname: string };
}

// Aniston VMS sign-in — split "welcome" layout mirroring .claude/docs/Login-Page.png:
// a light form panel (#F7F9FC) beside a light-blue welcome panel (#D8EAF7) with a curved seam.
// Access token + user are held in memory only (features/auth/auth.slice.ts) —
// never localStorage/sessionStorage.
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

  const fieldBase =
    'peer w-full rounded-xl border bg-auth-field px-3.5 py-2.5 text-sm text-auth-ink outline-none transition-colors placeholder:text-auth-muted focus:border-auth-accent focus:ring-2 focus:ring-auth-accent/25';

  return (
    <div className="min-h-screen w-full bg-auth-bg">
      <motion.div
        initial={reduceMotion ? false : 'hidden'}
        animate="visible"
        variants={pageTransition}
        className="relative w-full overflow-hidden bg-auth-bg"
      >
        <div className="relative flex min-h-screen flex-col md:flex-row">
          {/* ── Form panel (#F7F9FC) ─────────────────────────────── */}
          <div className="relative z-10 flex w-full flex-col justify-center bg-auth-surface px-7 py-10 sm:px-12 md:w-[52%]">
            {/* Compact brand (mobile only) */}
            <div className="mb-8 flex items-center gap-2.5 md:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-auth-accent">
                <Cctv size={16} strokeWidth={1.5} className="text-white" />
              </span>
              <span className="font-heading text-base font-semibold text-auth-ink">
                Aniston VMS
              </span>
            </div>

            <div className="mx-auto w-full max-w-sm">
              <h1 className="text-center font-heading text-2xl font-semibold text-auth-ink">
                Sign in
              </h1>

              {formError && (
                <div className="mt-5 flex items-start gap-2 rounded-xl border border-coral/30 bg-coral-soft px-3.5 py-2.5 text-sm text-coral">
                  <ShieldAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-6">
                <div>
                  <label htmlFor="login-email" className="text-xs font-medium text-auth-ink">
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    placeholder="you@example.com"
                    className={cn(fieldBase, errors.email ? 'border-coral' : 'border-auth-border')}
                    {...register('email')}
                  />
                  {errors.email?.message && (
                    <p className="mt-1 text-xs text-coral">{errors.email.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="login-password" className="text-xs font-medium text-auth-ink">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className={cn(
                        fieldBase,
                        'pr-10',
                        errors.password ? 'border-coral' : 'border-auth-border'
                      )}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-auth-muted transition-colors hover:text-auth-accent"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.password?.message && (
                    <p className="mt-1 text-xs text-coral">{errors.password.message}</p>
                  )}
                </div>

                {mfaRequired && (
                  <div>
                    <label htmlFor="login-mfa" className="text-xs font-medium text-auth-ink">
                      Authenticator code
                    </label>
                    <div className="relative">
                      <KeyRound
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-auth-muted"
                      />
                      <input
                        id="login-mfa"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        maxLength={6}
                        autoFocus
                        className={cn(
                          fieldBase,
                          'pl-10',
                          errors.mfaCode ? 'border-coral' : 'border-auth-border'
                        )}
                        {...register('mfaCode')}
                      />
                    </div>
                    <p className="mt-1 text-xs text-auth-muted">
                      Enter the 6-digit code from your authenticator app
                    </p>
                    {errors.mfaCode?.message && (
                      <p className="mt-1 text-xs text-coral">{errors.mfaCode.message}</p>
                    )}
                  </div>
                )}

                <div className="pt-2 text-center">
                  <p className="mb-3 text-xs text-auth-muted">
                    You&apos;re all set — pick up where you left off.
                  </p>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-auth-accent px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-auth-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-auth-accent focus-visible:ring-offset-2 focus-visible:ring-offset-auth-surface disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Sign in
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Illustration panel (blue, curved seam) ───────── */}
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[54%] md:block">
            {/* Curved seam: blue shape whose left edge waves into the sign-in surface. */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                className="fill-auth-panel"
                d="M26 0 C56 16, 2 44, 24 72 C38 92, 32 96, 44 100 L100 100 L100 0 Z"
              />
            </svg>

            {/* Overlay: brand pinned top-right; welcome copy + art centred within the
                blue mass — clear of the curved seam, responsive, never viewport-centred. */}
            <div className="pointer-events-auto absolute inset-0">
              <div className="absolute right-8 top-9 flex items-center gap-2 text-auth-ink/80 lg:right-12">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-auth-ink/10">
                  <Cctv size={13} strokeWidth={1.5} className="text-auth-ink" />
                </span>
                <span className="text-sm font-semibold tracking-tight">Aniston VMS</span>
              </div>

              <div className="flex h-full flex-col items-center justify-center gap-7 pl-[32%] pr-8 text-center lg:pl-[30%] lg:pr-12">
                <div>
                  <h2 className="font-heading text-3xl font-bold leading-tight text-auth-ink">
                    Welcome back!
                  </h2>
                  <p className="mt-2 text-sm text-auth-muted">Pick up where you left off.</p>
                </div>
                <LoginIllustration className="w-52 max-w-full lg:w-60" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
