'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, User } from 'lucide-react';

const STORAGE_KEY = 'unihub-auth';
const ROLE_ROUTES: Record<string, string> = {
  Administrator: '/admin/dashboard',
  'Project Leader': '/project-leader/dashboard',
  Participant: '/participant/Feeds',
};

interface User {
  id: string;
  role: string;
  token: string;
  email?: string;
}

export default function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [registerRole, setRegisterRole] = useState<'Participant' | 'Project Leader'>('Participant');
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginOtpRequired, setLoginOtpRequired] = useState(false);
  const [loginOtp, setLoginOtp] = useState('');
  const router = useRouter();
  const isRedirecting = !!user;
  const isLoginMode = authMode === 'login';
  const trackTranslateClass = isLoginMode ? 'translate-x-0' : '-translate-x-1/2';

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Partial<User> | null;
      if (parsed && parsed.id && parsed.role && parsed.token) {
        setUser(parsed as User);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (restoreError) {
      console.error('Failed to restore authentication state', restoreError);
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  useEffect(() => {
    if (isRestoring || !user) {
      return;
    }

    const targetRoute = ROLE_ROUTES[user.role];

    if (targetRoute) {
      setProgress(100);
      const timeout = window.setTimeout(() => {
        router.replace(targetRoute);
      }, 500);

      return () => window.clearTimeout(timeout);
    }

    console.warn('Unknown role encountered during redirect:', user.role);
    setUser(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, [user, isRestoring, router]);

  useEffect(() => {
    let interval: number | undefined;

    if (loading) {
      setProgress((prev) => (prev === 0 ? 10 : prev));
      interval = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            return prev;
          }

          const nextValue = prev + Math.random() * 15;
          return Math.min(nextValue, 90);
        });
      }, 180) as unknown as number;
    } else if (!user) {
      setProgress(0);
    }

    return () => {
      if (interval) {
        window.clearInterval(interval);
      }
    };
  }, [loading, user]);

  const handleToggleMode = () => {
    if (loading || isRedirecting) {
      return;
    }
    setError('');
    setNotice('');
    setProgress(0);
    setLoginOtpRequired(false);
    setLoginOtp('');
    setAuthMode(isLoginMode ? 'register' : 'login');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    setProgress(10);

    try {
      if (loginOtpRequired && !loginOtp.trim()) {
        throw new Error('Please enter the verification code that was sent to your email.');
      }

      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          loginOtpRequired && loginOtp.trim()
            ? { email, password, otp: loginOtp.trim() }
            : { email, password },
        ),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error((data as any).message || 'Something went wrong');
      }

      if ((data as any).requiresVerification) {
        setLoginOtpRequired(true);
        setLoginOtp('');
        setNotice((data as any).message || 'We sent a verification code to your email. Please enter it to continue.');
        setError('');
        return;
      }

      console.log('Login successful:', data);
      const authenticatedUser = {
        id: (data as any).user.id,
        role: (data as any).user.role,
        token: (data as any).token,
        email: (data as any).user.email,
      } as User;
      setProgress(100);
      setUser(authenticatedUser);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(authenticatedUser));
      setLoginOtpRequired(false);
      setLoginOtp('');
    } catch (err: any) {
      setError(err.message);
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!registerName || !registerEmail || !registerPassword) {
      setError('Please fill in all required fields.');
      return;
    }

    if (registerPassword !== registerConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setProgress(10);

    try {
      const res = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: registerName,
          email: registerEmail,
          password: registerPassword,
          role: registerRole,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error((data as any).message || 'Registration failed. Please try again.');
      }

      setProgress(100);
      setRegisterName('');
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      setRegisterRole('Participant');
      setAuthMode('login');
      setNotice(
        (data as any).message ||
          'Registration successful. Please check your email for a verification code, then log in.',
      );
    } catch (err: any) {
      console.error('Registration failed', err);
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      window.setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 350);
    }
  };

  if (isRestoring) {
    const width = progress > 0 ? progress : 60;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-yellow-50 via-white to-amber-100">
        <div className="fixed inset-x-0 top-0 z-50">
          <div
            className="h-1 w-full origin-left bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 transition-[width] duration-300"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen bg-gradient-to-br from-yellow-50 via-white to-amber-100">
      <div className="absolute inset-0 overflow-hidden">
        <div className="pointer-events-none absolute -left-24 top-[-10%] h-[360px] w-[360px] rounded-full bg-gradient-to-tr from-amber-200/60 via-yellow-100 to-white blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 right-[-10%] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-orange-200/70 via-yellow-100 to-white blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-100/40" />
      </div>

      {(loading || progress > 0 || isRedirecting) && (
        <div className="fixed inset-x-0 top-0 z-50">
          <div
            className="h-1 w-full origin-left bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 transition-[width] duration-300"
            style={{ width: `${progress > 0 ? progress : 60}%` }}
          />
        </div>
      )}

      <div className="relative z-10 flex w-full items-center justify-center px-6 py-12 lg:px-16">
        <div className="relative w-full max-w-6xl overflow-hidden">
          <div
            className={`flex w-[200%] flex-nowrap transition-transform duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] ${trackTranslateClass}`}
          >
            <section className="flex w-full flex-col-reverse items-stretch justify-center gap-12 px-2 py-6 sm:px-4 lg:flex-row lg:items-center lg:px-6">
              <div className="mx-auto max-w-xl space-y-8 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-500 shadow-sm shadow-amber-100">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Extension Services Network
                </div>
                <div className="space-y-4">
                  <h1 className="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl">
                    Empowering <span className="bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500 bg-clip-text text-transparent">extension</span>{' '}
                    projects with clarity.
                  </h1>
                  <p className="text-base text-gray-600 sm:text-lg">
                    UniHub centralizes proposals, collaboration, and execution. Sign in to coordinate your teams, streamline
                    approvals, and bring community-driven initiatives to life.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600 lg:justify-start">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm shadow-amber-100">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-white">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M12 3l2.09 6.26H21l-5.17 3.76 1.98 6.11L12 15.77l-5.81 3.36 1.98-6.11L3 9.26h6.91z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Co-designed with community partners</p>
                      <p className="text-xs text-gray-500">Built around real needs from barangay initiatives</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm shadow-amber-100">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M19.5 6A7.5 7.5 0 006 6m13.5 0A7.5 7.5 0 0112 19.5 7.5 7.5 0 014.5 6" />
                        <path d="M6.75 9h10.5M6.75 12h6" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Streamlined proposal workflows</p>
                      <p className="text-xs text-gray-500">Launch with ready-to-review formats in minutes</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mx-auto w-full max-w-md">
                <div className="rounded-3xl border border-white/60 bg-white/90 p-8 shadow-xl shadow-amber-100 backdrop-blur">
                  <div className="space-y-3 text-center">
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.6}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.866-3.582 7-8 7 4.418 0 8 3.134 8 7 0-3.866 3.582-7 8-7-4.418 0-8-3.134-8-7z" />
                      </svg>
                      Project Workspace Access
                    </span>
                    <h2 className="text-2xl font-bold text-gray-900">Sign in to continue</h2>
                    <p className="text-sm text-gray-500">
                      Use your organization-issued credentials to access UniHub&apos;s project workspace and monitoring dashboard.
                    </p>
                  </div>
                  {isLoginMode && error && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
                  )}
                  {isLoginMode && !error && notice && (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                      {notice}
                    </p>
                  )}
                  {isRedirecting && !error && !notice && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                      Redirecting to your dashboard…
                    </p>
                  )}
                  <form className="mt-6 space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-1">
                      <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Email address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400" />
                        <input
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={loading || isRedirecting}
                          className="w-full rounded-xl border border-amber-100/80 bg-white/90 py-3 pl-10 pr-4 text-sm text-gray-900 shadow-inner shadow-amber-50 transition focus:border-amber-400 focus:shadow-lg focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="you@example.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="password" className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <span>Password</span>
                        <a href="#" className="text-amber-500 hover:text-amber-600">
                          Forgot?
                        </a>
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400" />
                        <input
                          id="password"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={loading || isRedirecting}
                          className="w-full rounded-xl border border-amber-100/80 bg-white/90 py-3 pl-10 pr-4 text-sm text-gray-900 shadow-inner shadow-amber-50 transition focus:border-amber-400 focus:shadow-lg focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Enter your password"
                        />
                      </div>
                    </div>

                    {loginOtpRequired && (
                      <div className="space-y-1">
                        <label
                          htmlFor="otp"
                          className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                        >
                          Verification code
                        </label>
                        <div className="relative">
                          <input
                            id="otp"
                            name="otp"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            required
                            value={loginOtp}
                            onChange={(e) => setLoginOtp(e.target.value)}
                            disabled={loading || isRedirecting}
                            className="w-full rounded-xl border border-emerald-100/80 bg-white/90 py-3 px-4 text-sm text-gray-900 shadow-inner shadow-emerald-50 transition focus:border-emerald-400 focus:shadow-lg focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                            placeholder="Enter the 6-digit code sent to your email"
                          />
                        </div>
                        <p className="text-[11px] text-gray-500">
                          We sent a one-time verification code to your email. Enter it here to finish signing in.
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-amber-200 text-amber-500 focus:ring-amber-400"
                          disabled
                        />
                        <span>Remember me</span>
                      </label>
                      <span>SECURE ACCESS</span>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || isRedirecting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-200 transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading && isLoginMode ? 'Signing In…' : isRedirecting ? 'Redirecting…' : 'Sign In'}
                    </button>
                  </form>

                  <div className="mt-6 space-y-4 text-xs text-gray-500">
                    <div className="flex items-center gap-3 text-left">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-100 bg-amber-50 text-amber-500">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="9" />
                        </svg>
                      </div>
                      <p>Access UniHub between 7:00 AM – 9:00 PM. Scheduled maintenance every first Monday of the month.</p>
                    </div>
                    <p className="text-center text-[11px] text-gray-400">
                      By continuing, you agree to abide by our data privacy policies and uphold responsible digital citizenship.
                    </p>
                    <p className="pt-2 text-center text-xs text-gray-500">
                      <span>New to UniHub?</span>{' '}
                      <button
                        type="button"
                        onClick={handleToggleMode}
                        className="font-semibold text-amber-500 transition hover:text-amber-600"
                      >
                        Create an account
                      </button>
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="flex w-full flex-col items-stretch justify-center gap-12 px-2 py-6 sm:px-4 lg:flex-row lg:items-center lg:px-6">
              <div className="mx-auto w-full max-w-md">
                <div className="rounded-3xl border border-white/60 bg-white/90 p-8 shadow-xl shadow-amber-100 backdrop-blur">
                  <div className="space-y-3 text-center lg:text-left">
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-500">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.6}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 4h10M7 9h6m-6 5h10m-5 5h5" />
                      </svg>
                      Start your workspace
                    </span>
                    <h2 className="text-2xl font-bold text-gray-900">Create your UniHub account</h2>
                    <p className="text-sm text-gray-500">
                      Set up a profile for your extension projects, invite collaborators, and unlock shared proposal tools.
                    </p>
                  </div>
                  {!isLoginMode && error && (
                    <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
                  )}
                  <form className="mt-6 space-y-4" onSubmit={handleRegister}>
                    <div className="space-y-1">
                      <label htmlFor="register-name" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Full name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400" />
                        <input
                          id="register-name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          required
                          value={registerName}
                          onChange={(e) => setRegisterName(e.target.value)}
                          disabled={loading}
                          className="w-full rounded-xl border border-amber-100/80 bg-white/90 py-3 pl-10 pr-4 text-sm text-gray-900 shadow-inner shadow-amber-50 transition focus:border-amber-400 focus:shadow-lg focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Alex Rivera"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="register-email" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Email address
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400" />
                        <input
                          id="register-email"
                          name="register-email"
                          type="email"
                          autoComplete="email"
                          required
                          value={registerEmail}
                          onChange={(e) => setRegisterEmail(e.target.value)}
                          disabled={loading}
                          className="w-full rounded-xl border border-amber-100/80 bg-white/90 py-3 pl-10 pr-4 text-sm text-gray-900 shadow-inner shadow-amber-50 transition focus:border-amber-400 focus:shadow-lg focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="teamlead@example.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="register-role" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Role
                      </label>
                      <div className="relative">
                        <select
                          id="register-role"
                          name="register-role"
                          value={registerRole}
                          onChange={(e) => setRegisterRole(e.target.value as 'Participant' | 'Project Leader')}
                          disabled={loading}
                          className="w-full appearance-none rounded-xl border border-amber-100/80 bg-white/90 py-3 pl-4 pr-10 text-sm text-gray-900 shadow-inner shadow-amber-50 transition focus:border-amber-400 focus:shadow-lg focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="Participant">Participant</option>
                          <option value="Project Leader">Project Leader</option>
                        </select>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400"
                        >
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="register-password" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400" />
                        <input
                          id="register-password"
                          name="register-password"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={registerPassword}
                          onChange={(e) => setRegisterPassword(e.target.value)}
                          disabled={loading}
                          className="w-full rounded-xl border border-amber-100/80 bg-white/90 py-3 pl-10 pr-4 text-sm text-gray-900 shadow-inner shadow-amber-50 transition focus:border-amber-400 focus:shadow-lg focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Create a strong password"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="register-confirm" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Confirm password
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-400" />
                        <input
                          id="register-confirm"
                          name="register-confirm"
                          type="password"
                          autoComplete="new-password"
                          required
                          value={registerConfirmPassword}
                          onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                          disabled={loading}
                          className="w-full rounded-xl border border-amber-100/80 bg-white/90 py-3 pl-10 pr-4 text-sm text-gray-900 shadow-inner shadow-amber-50 transition focus:border-amber-400 focus:shadow-lg focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Re-enter your password"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-amber-200 transition hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading && !isLoginMode ? 'Setting Up…' : 'Register'}
                    </button>
                  </form>

                  <p className="mt-6 text-xs text-gray-500 lg:text-left">
                    Already part of UniHub?{' '}
                    <button
                      type="button"
                      onClick={handleToggleMode}
                      className="font-semibold text-amber-500 transition hover:text-amber-600"
                    >
                      Sign in instead
                    </button>
                  </p>
                </div>
              </div>

              <div className="mx-auto max-w-xl space-y-8 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-500 shadow-sm shadow-amber-100">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  Welcome new collaborators
                </div>
                <div className="space-y-4">
                  <h2 className="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl">
                    Launch your extension team in UniHub.
                  </h2>
                  <p className="text-base text-gray-600 sm:text-lg">
                    Manage onboarding, set alignment rituals, and give every volunteer the same polished workspace from day one.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-600 lg:justify-start">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm shadow-amber-100">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M12 5v14m7-7H5" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Invite teammates instantly</p>
                      <p className="text-xs text-gray-500">Share project roles and document access as soon as you register.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 shadow-sm shadow-amber-100">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-white">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path d="M8 7h8a2 2 0 0 1 2 2v8l-4-2-4 2V9a2 2 0 0 1 2-2z" />
                        <path d="M6 5h12" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Curated onboarding guides</p>
                      <p className="text-xs text-gray-500">Customize welcome notes and start each project with clarity.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
