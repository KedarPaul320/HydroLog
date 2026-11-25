import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Trash2, UserPlus } from 'lucide-react';
import { AuthProviderDisabledError, api } from '../api/client';
import { FIREBASE_AUTH_PROVIDERS_URL } from '../lib/firebase';
import type { AppRoute, User, UserRole } from '../types';
import { formatDateTime } from '../utils/meterLogic';

interface UserManagementScreenProps {
  currentUserId: string;
  onNavigate: (route: AppRoute) => void;
}

export function UserManagementScreen({
  currentUserId,
  onNavigate,
}: UserManagementScreenProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [providerDisabled, setProviderDisabled] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [directoryNotice, setDirectoryNotice] = useState<string | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getUsers()
      .then((list) => {
        if (active) setUsers(list);
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Unable to load users.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setProviderDisabled(false);
    setSuccessMsg(null);

    if (name.trim().length < 2) {
      setFormError('Enter a full name (at least 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    setCreating(true);
    try {
      const created = await api.createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      });
      setUsers((prev) => [created, ...prev]);
      setSuccessMsg(`Created ${created.role === 'admin' ? 'Admin' : 'Field User'} account for ${created.name} (${created.email}).`);
      setName('');
      setEmail('');
      setPassword('');
      setRole('user');
    } catch (err) {
      if (err instanceof AuthProviderDisabledError) {
        setProviderDisabled(true);
      }
      setFormError(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteUser(target: User) {
    setDirectoryError(null);
    setDirectoryNotice(null);
    setDeletingId(target.id);
    try {
      await api.deleteUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      setConfirmDeleteId(null);
      setDirectoryNotice(
        `Deleted account for ${target.name} (${target.email}). Existing meter readings remain archived.`
      );
    } catch (err) {
      setDirectoryError(err instanceof Error ? err.message : 'Unable to delete user.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Mobile switcher between Users and Plants & Motors */}
      <div className="lg:hidden flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
        <button
          type="button"
          aria-current="page"
          className="flex-1 min-h-[40px] rounded-md text-xs font-medium bg-white text-slate-900 shadow-sm cursor-pointer"
        >
          Users
        </button>
        <button
          type="button"
          onClick={() => onNavigate('plants-motors')}
          className="flex-1 min-h-[40px] rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          Plants & Motors
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
        <p className="text-sm text-slate-600 mt-1">
          Provision field operator and administrator accounts. Public registration is disabled.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Create User Form */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">Create New Account</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Share the email and password securely with the operator so they can sign in on Android or web.
          </p>

          {formError && (
            <div role="alert" className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700 space-y-1.5">
              <p>{formError}</p>
              {providerDisabled && (
                <a
                  href={FIREBASE_AUTH_PROVIDERS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-red-900 underline"
                >
                  <span>Enable Email/Password in Firebase Console</span>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          )}

          {successMsg && (
            <div role="status" className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-sm text-emerald-800">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleCreateUser} noValidate className="mt-5 space-y-4">
            <div>
              <label htmlFor="new-user-name" className="block text-sm font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="new-user-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>

            <div>
              <label htmlFor="new-user-email" className="block text-sm font-medium text-slate-700 mb-1">
                Work Email
              </label>
              <input
                id="new-user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.rivera@aquaflow.io"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>

            <div>
              <label htmlFor="new-user-password" className="block text-sm font-medium text-slate-700 mb-1">
                Initial Password
              </label>
              <input
                id="new-user-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-700/20 focus:border-sky-700"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1.5">Role</span>
              <div
                role="radiogroup"
                aria-label="Account Role"
                className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={role === 'user'}
                  onClick={() => setRole('user')}
                  className={`min-h-[40px] rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    role === 'user'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Field User
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={role === 'admin'}
                  onClick={() => setRole('admin')}
                  className={`min-h-[40px] rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    role === 'admin'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admin
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              <span>{creating ? 'Creating Account...' : 'Create User Account'}</span>
            </button>
          </form>
        </section>

        {/* User Directory */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Active Accounts ({users.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              All operators and administrators provisioned on the server
            </p>
          </div>

          {loadError && (
            <div role="alert" className="p-4 bg-red-50 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {directoryError && (
            <div role="alert" className="px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
              {directoryError}
            </div>
          )}

          {directoryNotice && (
            <div role="status" className="px-6 py-3 bg-emerald-50 border-b border-emerald-200 text-sm text-emerald-800">
              {directoryNotice}
            </div>
          )}

          {loading ? (
            <div className="p-6 space-y-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 rounded" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-3.5">Operator</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3 text-right">Readings</th>
                    <th className="py-3 px-3">Created</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const isConfirming = confirmDeleteId === u.id;
                    const isDeleting = deletingId === u.id;

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3.5">
                          <div className="font-medium text-slate-900">{u.name}</div>
                          <div className="text-xs text-slate-500 font-mono">{u.email}</div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={
                              u.role === 'admin'
                                ? 'text-xs font-semibold text-sky-800'
                                : 'text-xs font-medium text-slate-600'
                            }
                          >
                            {u.role === 'admin' ? 'Administrator' : 'Field User'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800">
                          {u.readingCount ?? 0}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                          {formatDateTime(u.createdAt)}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          {isSelf ? (
                            <span className="text-xs font-medium text-slate-400">Current</span>
                          ) : isConfirming ? (
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => handleDeleteUser(u)}
                                className="min-h-[36px] px-2.5 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer"
                              >
                                {isDeleting ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setConfirmDeleteId(null)}
                                className="min-h-[36px] px-2.5 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setDirectoryError(null);
                                setConfirmDeleteId(u.id);
                              }}
                              aria-label={`Delete user ${u.name}`}
                              className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-lg text-slate-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
