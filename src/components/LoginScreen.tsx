import { useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  ExternalLink,
  KeyRound,
  Lock,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import {
  AuthProviderDisabledError,
  BOOTSTRAP_OWNER_EMAIL,
  api,
} from '../api/client';
import { FIREBASE_AUTH_PROVIDERS_URL } from '../lib/firebase';
import type { User } from '../types';
import { isAndroidAppRuntime } from '../utils/meterLogic';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  pendingVerificationEmail?: string | null;
  initialError?: string | null;
}

export function LoginScreen({
  onLoginSuccess,
  pendingVerificationEmail = null,
  initialError = null,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [providerDisabled, setProviderDisabled] = useState(false);

  const isAndroidApp = isAndroidAppRuntime(
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
    typeof window !== 'undefined' &&
      Boolean((window as unknown as { HydroLogAndroid?: unknown }).HydroLogAndroid)
  );

  // Collapsible First-Time Administrator Setup (owner-only bootstrap, web only)
  const [setupOpen, setSetupOpen] = useState(Boolean(pendingVerificationEmail));
  const [setupName, setSetupName] = useState('Plant Administrator');
  const [setupEmail, setSetupEmail] = useState(BOOTSTRAP_OWNER_EMAIL);
  const [setupPassword, setSetupPassword] = useState('');
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupNotice, setSetupNotice] = useState<string | null>(
    pendingVerificationEmail
      ? `Verification email sent to ${pendingVerificationEmail}. Click the link in your inbox, then tap "Complete Admin Setup" below.`
      : null
  );
  const [awaitingVerification, setAwaitingVerification] = useState(
    Boolean(pendingVerificationEmail)
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setProviderDisabled(false);
    if (!email.trim() || !password) {
      setError('Enter both your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.login(email.trim(), password);
      onLoginSuccess(res.user);
    } catch (err) {
      if (err instanceof AuthProviderDisabledError) {
        setProviderDisabled(true);
      }
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmailAdminSetup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSetupNotice(null);
    setProviderDisabled(false);
    setSetupBusy(true);
    try {
      const res = await api.bootstrapAdminWithEmail(setupName, setupEmail, setupPassword);
      if (res.user) {
        onLoginSuccess(res.user);
      } else if (res.verificationSent) {
        setAwaitingVerification(true);
        setSetupNotice(
          `Verification link sent to ${setupEmail.trim().toLowerCase()}. Open your email, verify your address, then click "Complete Admin Setup" below.`
        );
      }
    } catch (err) {
      if (err instanceof AuthProviderDisabledError) {
        setProviderDisabled(true);
      }
      setError(err instanceof Error ? err.message : 'Unable to initialize administrator account.');
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleCompleteEmailVerification() {
    setError(null);
    setSetupBusy(true);
    try {
      const res = await api.completeEmailAdminBootstrap(setupName);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete verification.');
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleResendVerification() {
    setError(null);
    setSetupBusy(true);
    try {
      await api.resendVerificationEmail();
      setSetupNotice('A new verification email has been sent. Please check your inbox and spam folder.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setSetupBusy(false);
    }
  }

  async function handleGoogleAdminSetup() {
    setError(null);
    setSetupNotice(null);
    setProviderDisabled(false);
    setSetupBusy(true);
    try {
      const res = await api.bootstrapAdminWithGoogle(
        setupName,
        setupPassword.trim().length >= 6 ? setupPassword : undefined
      );
      onLoginSuccess(res.user);
    } catch (err) {
      if (err instanceof AuthProviderDisabledError) {
        setProviderDisabled(true);
      }
      setError(err instanceof Error ? err.message : 'Unable to complete Google admin setup.');
    } finally {
      setSetupBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:grid lg:grid-cols-12">
      {/* Left editorial utility panel (desktop) */}
      <aside className="hidden lg:flex lg:col-span-6 xl:col-span-7 bg-slate-900 text-slate-100 flex-col justify-between p-12 relative overflow-hidden">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-sky-600 flex items-center justify-center text-white shrink-0">
            <Droplets className="w-5 h-5" aria-hidden="true" />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight text-white">
            HydroLog
          </span>
        </div>

        <div className="max-w-lg my-auto">
          <p className="text-sm text-sky-400 font-medium mb-3">
            Plant Water Metering Operations
          </p>
          <h1 className="text-4xl font-bold text-white leading-tight text-balance">
            Verified field readings with meter photo evidence across every plant.
          </h1>
          <p className="text-base text-slate-300 mt-4 leading-relaxed">
            Field operators capture daily cubic meter totals on-site across all configured plants
            and motors. Records and meter photos are stored persistently in the cloud and
            automatically pruned after 45 days.
          </p>

          <div className="mt-10 pt-8 border-t border-slate-800 grid grid-cols-3 gap-6">
            <div>
              <div className="text-2xl font-semibold text-white font-mono tabular-nums">45d</div>
              <div className="text-xs text-slate-400 mt-1">Auto-retention window</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white font-mono tabular-nums">m³</div>
              <div className="text-xs text-slate-400 mt-1">Photo-verified flow</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-white font-mono tabular-nums">.xlsx</div>
              <div className="text-xs text-slate-400 mt-1">Direct Excel export</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
          <span>Persistent cloud database with role-based Firestore security rules.</span>
        </div>
      </aside>

      {/* Right login form */}
      <main className="flex-1 lg:col-span-6 xl:col-span-5 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-4">
          <div className="flex items-center gap-2.5 lg:hidden mb-4">
            <div className="w-9 h-9 rounded-lg bg-sky-700 flex items-center justify-center text-white shrink-0">
              <Droplets className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-slate-900">
              HydroLog
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in</h2>
            <p className="text-sm text-slate-600 mt-1.5">
              Use credentials issued by your plant administrator. Public registration is disabled.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 space-y-2"
              >
                <p>{error}</p>
                {providerDisabled && (
                  <a
                    href={FIREBASE_AUTH_PROVIDERS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-900 underline hover:text-red-950"
                  >
                    <span>Enable Email/Password in Firebase Console</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Work Email
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                <Lock className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
              </button>
            </form>

            {/* Collapsible owner-only first-time initialization (web only — hidden in Android app) */}
            {!isAndroidApp && (
              <div className="mt-6 pt-5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSetupOpen((v) => !v)}
                  aria-expanded={setupOpen}
                  className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <span>First-time administrator setup</span>
                  </span>
                  {setupOpen ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  )}
                </button>

                {setupOpen && (
                  <div className="mt-4 space-y-4">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Run once to initialize the primary administrator account (
                      <span className="font-mono text-slate-800">{BOOTSTRAP_OWNER_EMAIL}</span>) and
                      default plants &amp; motors in Firestore.
                    </p>

                    {setupNotice && (
                      <div
                        role="status"
                        className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs text-emerald-800"
                      >
                        {setupNotice}
                      </div>
                    )}

                    {awaitingVerification ? (
                      <div className="space-y-2.5">
                        <button
                          type="button"
                          disabled={setupBusy}
                          onClick={handleCompleteEmailVerification}
                          className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                          <span>{setupBusy ? 'Checking...' : 'I Verified My Email — Complete Setup'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={setupBusy}
                          onClick={handleResendVerification}
                          className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <MailCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Resend Verification Email</span>
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleEmailAdminSetup} className="space-y-3" noValidate>
                        <div>
                          <label
                            htmlFor="setup-admin-name"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            Administrator Name
                          </label>
                          <input
                            id="setup-admin-name"
                            type="text"
                            value={setupName}
                            onChange={(e) => setSetupName(e.target.value)}
                            placeholder="Your full name"
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="setup-admin-email"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            Owner Email
                          </label>
                          <input
                            id="setup-admin-email"
                            type="email"
                            value={setupEmail}
                            onChange={(e) => setSetupEmail(e.target.value)}
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="setup-admin-password"
                            className="block text-xs font-medium text-slate-700 mb-1"
                          >
                            Set Administrator Password
                          </label>
                          <input
                            id="setup-admin-password"
                            type="password"
                            minLength={6}
                            value={setupPassword}
                            onChange={(e) => setSetupPassword(e.target.value)}
                            placeholder="Minimum 6 characters"
                            className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={setupBusy}
                          className="w-full min-h-[42px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                        >
                          {setupBusy ? 'Initializing...' : 'Create Admin Account with Email & Password'}
                        </button>

                        <div className="relative py-1 flex items-center">
                          <div className="flex-1 border-t border-slate-200" />
                          <span className="px-2 text-[11px] text-slate-400">or</span>
                          <div className="flex-1 border-t border-slate-200" />
                        </div>

                        <button
                          type="button"
                          disabled={setupBusy}
                          onClick={handleGoogleAdminSetup}
                          className="w-full min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-800 text-xs font-semibold cursor-pointer"
                        >
                          Initialize Admin Instantly with Google ({BOOTSTRAP_OWNER_EMAIL})
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
