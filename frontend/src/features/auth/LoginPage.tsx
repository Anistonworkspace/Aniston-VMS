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

// Aniston VMS sign-in — split "welcome" layout mirroring the reference mock:
// a light form panel (--auth-surface) beside a light-blue welcome panel
// (--auth-panel) joined by a curved wave seam, with a security-camera
// illustration. Access token + user are held in memory only
// (features/auth/auth.slice.ts) — never localStorage/sessionStorage.
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
    'peer w-full rounded-xl border bg-auth-field px-4 py-3 text-sm text-auth-ink outline-none transition-colors placeholder:text-auth-muted focus:border-auth-accent focus:ring-2 focus:ring-auth-accent/25';

  return (
    <div className="flex min-h-[100svh] w-full items-stretch justify-center bg-[var(--auth-bg)] md:h-[100svh] md:max-h-[100svh] md:overflow-hidden">
      <motion.div
        initial={reduceMotion ? false : 'hidden'}
        animate="visible"
        variants={pageTransition}
        className="relative flex w-full flex-col overflow-hidden bg-auth-surface md:flex-row"
      >
        {/* ── Curved wave seam: a full-height blue field with an S-curved left
           edge that flows slightly onto the form surface. Desktop only. ────── */}
        <svg
          className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full md:block"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="auth-seam-shadow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0f2848" stopOpacity="0" />
              <stop offset="1" stopColor="#0f2848" stopOpacity="0.07" />
            </linearGradient>
          </defs>
          {/* Soft shadow the blue field casts onto the form surface */}
          <path
            d="M786 0C734 150 654 300 684 450C714 600 794 720 754 900L900 900L900 0Z"
            fill="url(#auth-seam-shadow)"
          />
          {/* Blue welcome field */}
          <path
            className="fill-auth-panel"
            d="M800 0C748 150 668 300 698 450C728 600 808 720 768 900L1440 900L1440 0Z"
          />
          {/* Crisp highlight along the crest of the wave */}
          <path
            d="M800 0C748 150 668 300 698 450C728 600 808 720 768 900"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.6"
            strokeWidth="2"
          />
        </svg>

        {/* ── Form panel ──────────────────────────────────────── */}
        <div className="relative z-20 flex w-full flex-col justify-center px-6 py-12 sm:px-10 sm:py-14 md:w-1/2 md:px-14 md:py-[clamp(2rem,5vh,4rem)] lg:px-20">
          {/* Brand — pinned top-left */}
          <div className="absolute left-6 top-7 flex items-center gap-2 sm:left-10 sm:top-8 md:left-14 lg:left-20">
            <Cctv className="h-6 w-6 text-auth-ink" strokeWidth={1.75} aria-hidden />
            <span className="font-heading text-lg font-semibold tracking-tight text-auth-ink">
              Aniston VMS
            </span>
          </div>

          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-center font-heading text-3xl font-bold text-auth-ink">Sign in</h1>

            {formError && (
              <div className="mt-6 flex items-start gap-2 rounded-xl border border-coral/30 bg-coral-soft px-3.5 py-2.5 text-sm text-coral">
                <ShieldAlert size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-xs font-medium text-auth-ink"
                >
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
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-xs font-medium text-auth-ink"
                >
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
                      'pr-11',
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
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password?.message && (
                  <p className="mt-1 text-xs text-coral">{errors.password.message}</p>
                )}
              </div>

              {mfaRequired && (
                <div>
                  <label
                    htmlFor="login-mfa"
                    className="mb-1.5 block text-xs font-medium text-auth-ink"
                  >
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
                <p className="mb-3 text-sm text-auth-muted">
                  You&apos;re all set — pick up where you left off.
                </p>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-auth-accent px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-auth-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-auth-accent focus-visible:ring-offset-2 focus-visible:ring-offset-auth-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign in
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Welcome panel (blue) — heading near the top, illustration below ─ */}
        <div className="relative z-10 flex w-full flex-col items-center justify-center bg-auth-panel px-6 pb-[clamp(2rem,5vh,3rem)] pt-[clamp(2.5rem,6vh,4rem)] text-center md:w-1/2 md:bg-transparent md:px-10 lg:pl-[6%] lg:pr-[4%]">
          <div>
            <h2 className="font-heading text-[clamp(2rem,3.6vw,3rem)] font-bold leading-tight text-auth-ink">
              Welcome back!
            </h2>
            <p className="mx-auto mt-4 max-w-[34rem] text-[15px] leading-relaxed text-auth-muted">
              Your entire security network, monitored from one intelligent platform.
            </p>
          </div>
          <div className="flex w-full flex-1 items-center justify-center">
            <LoginIllustration className="mt-[clamp(1rem,3.5vh,2.5rem)] h-auto w-[min(100%,64vh,540px)]" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
