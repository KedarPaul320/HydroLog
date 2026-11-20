import { useState, type FormEvent } from 'react';
import { Droplets, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import type { User } from '../types';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter both your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.login(email.trim(), password);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  function fillCredentials(targetEmail: string, targetPassword: string) {
    setEmail(targetEmail);
    setPassword(targetPassword);
    setError(null);
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
            Field operators capture daily cubic meter totals on-site for Plant A, Plant B, and
            Plant C. Administrators monitor aggregated flow, review abnormalities, edit records,
            provision accounts, and export Excel reports.
          </p>

          <div className="mt-10 pt-8 border-t border-slate-800 grid grid-cols-3 gap-6">
            <div>
              <div className="text-2xl font-semibold text-white font-mono tabular-nums">3</div>
              <div className="text-xs text-slate-400 mt-1">Monitored plants</div>
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
          <span>Role-based access control enforced on the backend API.</span>
        </div>
      </aside>

      {/* Right login form */}
      <main className="flex-1 lg:col-span-6 xl:col-span-5 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2.5 lg:hidden mb-8">
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
                className="mt-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
              >
                {error}
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
                  placeholder="operator@aquaflow.io"
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

            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-xs font-medium text-slate-500 mb-3">
                Seeded demo accounts (click to autofill)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => fillCredentials('admin@aquaflow.io', 'admin123')}
                  className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 text-left transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold text-slate-900">Admin Account</div>
                  <div className="text-xs text-slate-500 font-mono truncate">
                    admin@aquaflow.io
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => fillCredentials('marcus@aquaflow.io', 'field123')}
                  className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50/50 text-left transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold text-slate-900">Field Operator</div>
                  <div className="text-xs text-slate-500 font-mono truncate">
                    marcus@aquaflow.io
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
