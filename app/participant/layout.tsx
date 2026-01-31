'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, type Socket } from 'socket.io-client';

import Sidebar from './components/Sidebar';
import HeaderBar from './components/HeaderBar';
import { participantNavigation } from './navigation';
import NotificationsPanel, { type NotificationItem } from '../admin/components/NotificationsPanel';

const STORAGE_KEY = 'unihub-auth';

interface StoredUser {
  id: string;
  role: string;
  token: string;
  email?: string;
}

export default function ParticipantLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutProgress, setLogoutProgress] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toastNotification, setToastNotification] = useState<NotificationItem | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const previousNotificationIdsRef = useRef<string[]>([]);
  const initialNotificationsLoadedRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSlideIn, setProfileSlideIn] = useState(false);
  const [profileOverlayIn, setProfileOverlayIn] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileRoleName, setProfileRoleName] = useState('');
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  const handleLogout = useCallback(() => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setLogoutProgress((prev) => (prev === 0 ? 10 : prev));

    window.setTimeout(() => {
      setLogoutProgress(100);
      window.localStorage.removeItem(STORAGE_KEY);
      router.replace('/');

      window.setTimeout(() => {
        setIsAuthorized(false);
        setIsLoggingOut(false);
      }, 400);
    }, 600);
  }, [isLoggingOut, router]);

  const handleOpenProfile = useCallback(async () => {
    try {
      setProfileError(null);
      setProfileLoading(true);

      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setProfileError('Your session information is missing. Please sign out and sign in again.');
        setProfileLoading(false);
        setProfileOpen(true);
        return;
      }

      const parsed = JSON.parse(stored) as StoredUser | null;
      if (!parsed?.id) {
        setProfileError('Your session information is incomplete. Please sign out and sign in again.');
        setProfileLoading(false);
        setProfileOpen(true);
        return;
      }

      const res = await fetch(`http://localhost:5000/api/auth/users/${encodeURIComponent(parsed.id)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setProfileError(data.message || 'Failed to load profile. Please try again.');
        setProfileLoading(false);
        setProfileOpen(true);
        return;
      }

      const data = (await res.json()) as {
        username?: string;
        email?: string;
        role?: { name?: string } | string;
      };

      setProfileUsername((data.username || '').trim());
      setProfileEmail((data.email || '').trim());
      const roleName = typeof data.role === 'string' ? data.role : data.role?.name;
      setProfileRoleName(roleName || 'Participant');
      setProfileOpen(true);
    } catch (error) {
      console.error('Failed to load participant profile', error);
      setProfileError('Failed to load profile. Please check your connection and try again.');
      setProfileOpen(true);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileOpen) {
      const id = window.setTimeout(() => {
        setProfileSlideIn(true);
        setProfileOverlayIn(true);
      }, 0);
      return () => window.clearTimeout(id);
    } else {
      setProfileSlideIn(false);
      setProfileOverlayIn(false);
    }
  }, [profileOpen]);

  const closeProfile = useCallback(() => {
    setProfileSlideIn(false);
    setProfileOverlayIn(false);
    window.setTimeout(() => setProfileOpen(false), 300);
  }, []);

  const handleChangePassword = useCallback(async () => {
    try {
      setPwdError(null);
      setPwdSuccess(null);
      if (!pwdCurrent || !pwdNew || !pwdConfirm) {
        setPwdError('Please fill in all password fields.');
        return;
      }
      if (pwdNew !== pwdConfirm) {
        setPwdError('New password and confirmation do not match.');
        return;
      }
      if (pwdNew.length < 6) {
        setPwdError('New password must be at least 6 characters.');
        return;
      }

      setPwdSaving(true);
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as StoredUser | null) : null;
      if (!parsed?.id) {
        setPwdError('Missing session. Please sign in again.');
        setPwdSaving(false);
        return;
      }

      const res = await fetch(`http://localhost:5000/api/auth/users/${encodeURIComponent(parsed.id)}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwdCurrent, newPassword: pwdNew }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPwdError(data.message || 'Failed to change password.');
        setPwdSaving(false);
        return;
      }

      setPwdSuccess('Password updated successfully.');
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
    } catch (e) {
      setPwdError('Failed to change password. Please try again.');
    } finally {
      setPwdSaving(false);
    }
  }, [pwdCurrent, pwdNew, pwdConfirm]);

  const handleSaveProfile = useCallback(async () => {
    try {
      setProfileError(null);
      setProfileSaving(true);

      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setProfileError('Your session information is missing. Please sign out and sign in again.');
        setProfileSaving(false);
        return;
      }

      const parsed = JSON.parse(stored) as StoredUser | null;
      if (!parsed?.id) {
        setProfileError('Your session information is incomplete. Please sign out and sign in again.');
        setProfileSaving(false);
        return;
      }

      const payload = {
        username: profileUsername.trim(),
        email: profileEmail.trim(),
      };

      const res = await fetch(`http://localhost:5000/api/auth/users/${encodeURIComponent(parsed.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setProfileError(data.message || 'Failed to save profile. Please try again.');
        setProfileSaving(false);
        return;
      }

      setProfileOpen(false);
    } catch (error) {
      console.error('Failed to save participant profile', error);
      setProfileError('Failed to save profile. Please check your connection and try again.');
    } finally {
      setProfileSaving(false);
    }
  }, [profileUsername, profileEmail]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        router.replace('/');
        return;
      }

      const parsed = JSON.parse(stored) as StoredUser | null;
      if (!parsed || parsed.role !== 'Participant') {
        window.localStorage.removeItem(STORAGE_KEY);
        router.replace('/');
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
      console.error('Failed to verify participant access', error);
      window.localStorage.removeItem(STORAGE_KEY);
      router.replace('/');
    }
  }, [router]);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/notifications');
        if (!res.ok) {
          return;
        }

        const data = (await res.json()) as Array<{
          _id: string;
          title: string;
          message: string;
          read?: boolean;
          createdAt?: string;
          project?: string;
        }>;

        const mapped: NotificationItem[] = data
          .map((item) => ({
            id: item._id,
            title: item.title,
            message: item.message,
            timestamp: item.createdAt
              ? new Date(item.createdAt).toLocaleString('en-PH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : '',
            read: item.read,
            projectId: item.project,
          }))
          .filter(
            (item) =>
              (item.title === 'Activity Starting Soon' ||
                item.title === 'Activity Started' ||
                item.title === 'Activity Ending Soon' ||
                item.title === 'Activity Ended') ||
              ![
                'New project created',
                'Join request',
                'Project approved',
                'Activity join',
              ].includes(item.title)
          );

        setNotifications(mapped);
      } catch (error) {
        console.error('Failed to load participant notifications', error);
      }
    };

    fetchNotifications();
  }, []);

  useEffect(() => {
    const socket = io('http://localhost:5000');
    socketRef.current = socket;

    // Identify the currently authenticated participant for online/offline tracking
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredUser | null;
        if (parsed?.id) {
          socket.emit('identify', { userId: parsed.id });
        }
      }
    } catch {
      // best-effort only
    }

    socket.on('notification:new', (payload: NotificationItem) => {
      if (
        (payload.title === 'New project created' ||
        payload.title === 'Join request' ||
        payload.title === 'Project approved' ||
        payload.title === 'Activity join') &&
        ![
          'Activity Starting Soon',
          'Activity Started',
          'Activity Ending Soon',
          'Activity Ended'
        ].includes(payload.title)
      ) {
        return;
      }

      setNotifications((prev) => {
        if (prev.some((n) => n.id === payload.id)) {
          return prev;
        }
        return [payload, ...prev];
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!notifications.length) {
      previousNotificationIdsRef.current = [];
      return;
    }

    const currentIds = notifications.map((n) => n.id);

    if (!initialNotificationsLoadedRef.current) {
      initialNotificationsLoadedRef.current = true;
      previousNotificationIdsRef.current = currentIds;
      return;
    }

    const previousIds = previousNotificationIdsRef.current;
    const newOnes = notifications.filter((n) => !previousIds.includes(n.id));

    if (newOnes.length > 0) {
      const latest = newOnes[0];
      setToastNotification(latest);
      setToastVisible(true);

      window.setTimeout(() => {
        setToastVisible(false);
        window.setTimeout(() => {
          setToastNotification((current) => (current && current.id === latest.id ? null : current));
        }, 400);
      }, 5000);
    }

    previousNotificationIdsRef.current = currentIds;
  }, [notifications]);

  useEffect(() => {
    if (!isLoggingOut) {
      setLogoutProgress(0);
      return;
    }

    const interval = window.setInterval(() => {
      setLogoutProgress((prev) => {
        if (prev >= 90) {
          return prev;
        }
        const nextValue = prev + Math.random() * 15;
        return Math.min(nextValue, 90);
      });
    }, 180);

    return () => {
      window.clearInterval(interval);
    };
  }, [isLoggingOut]);

  const handleToggleNotifications = useCallback(() => {
    setNotificationsOpen((prev) => {
      const next = !prev;
      if (!prev && next) {
        setNotifications((current) => {
          if (!current.some((n) => !n.read)) {
            return current;
          }

          window
            .fetch('http://localhost:5000/api/notifications/mark-read-all', {
              method: 'POST',
            })
            .catch((error) => {
              console.error('Failed to mark all notifications as read (participant)', error);
            });

          return current.map((n) => ({ ...n, read: true }));
        });
      }
      return next;
    });
  }, []);

  const handleNotificationClick = useCallback(
    (item: NotificationItem) => {
      setNotificationsOpen(false);

      setNotifications((current) => current.map((n) => (n.id === item.id ? { ...n, read: true } : n)));

      setToastNotification((current) => (current && current.id === item.id ? null : current));
      setToastVisible(false);

      window
        .fetch(`http://localhost:5000/api/notifications/${item.id}/read`, {
          method: 'PATCH',
        })
        .catch((error) => {
          console.error('Failed to mark notification as read (participant)', error);
        });

      if (item.title === 'Activity Evaluation' && item.message) {
        try {
          const msg = item.message;
          const startBracket = msg.indexOf('[');
          const endBracket = msg.indexOf(']');

          let projectName = '';
          let activityTitle = '';

          if (startBracket !== -1 && endBracket > startBracket) {
            projectName = msg.substring(startBracket + 1, endBracket).trim();
            const after = msg.substring(endBracket + 1);
            const colonIndex = after.indexOf(':');
            const titlePart = colonIndex !== -1 ? after.substring(0, colonIndex) : after;
            activityTitle = titlePart.trim();
          }

          const intent: {
            projectId?: string;
            projectName?: string;
            activityTitle?: string;
            email?: string;
          } = {};

          if (item.projectId) {
            intent.projectId = item.projectId;
          }
          if (projectName) {
            intent.projectName = projectName;
          }
          if (activityTitle) {
            intent.activityTitle = activityTitle;
          }

          try {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            if (stored) {
              const parsed = JSON.parse(stored) as StoredUser | null;
              if (parsed?.email && typeof parsed.email === 'string') {
                intent.email = parsed.email;
              }
            }
          } catch {
            // ignore auth parsing errors for evaluation intent
          }

          window.localStorage.setItem('unihub-activity-eval-intent', JSON.stringify(intent));

          try {
            window.dispatchEvent(new Event('unihub-activity-eval-intent'));
          } catch {
          }

          router.push('/participant/Feeds');
        } catch (error) {
          console.error('Failed to process Activity Evaluation notification click', error);
        }
      }
    },
    [router],
  );

  if (!isAuthorized && !isLoggingOut) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-amber-50 via-white to-white">
      {logoutProgress > 0 && (
        <div className="fixed inset-x-0 top-0 z-50">
          <div
            className="h-1 w-full origin-left bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 transition-[transform,width] duration-500"
            style={{ width: `${logoutProgress}%` }}
          />
        </div>
      )}

      {profileOpen && (
        <div className="fixed inset-0 z-60" role="dialog" aria-modal="true">
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${profileOverlayIn ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeProfile}
          />
          <div
            className={`absolute right-0 top-0 h-full w-full max-w-md border-l border-yellow-100 bg-white p-6 text-sm text-gray-800 shadow-2xl transition-transform duration-300 ease-out ${
              profileSlideIn ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-500">My profile</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900">Account details</h3>
                {profileRoleName && (
                  <p className="mt-0.5 text-[11px] text-gray-500">Role: {profileRoleName}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeProfile}
                className="rounded-full border border-yellow-200 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-50"
              >
                Close
              </button>
            </div>

            {profileLoading ? (
              <p className="text-xs text-gray-600">Loading profile…</p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label htmlFor="profile-username" className="font-medium text-gray-800">
                    Username
                  </label>
                  <input
                    id="profile-username"
                    type="text"
                    value={profileUsername}
                    onChange={(e) => setProfileUsername(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="Enter your username"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="profile-email" className="font-medium text-gray-800">
                    Email
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="Enter your email address"
                  />
                </div>

                {profileError && (
                  <p className="mt-1 text-[11px] font-medium text-red-600">{profileError}</p>
                )}

                <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setProfileOpen(false)}
                    className="rounded-full border border-yellow-200 px-3 py-1 font-semibold text-yellow-700 hover:bg-yellow-50"
                    disabled={profileSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="rounded-full bg-yellow-500 px-4 py-1.5 font-semibold text-white shadow hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={profileSaving}
                  >
                    {profileSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-900">Change password</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 text-xs">
                <div className="space-y-1">
                  <label htmlFor="profile-current-password" className="font-medium text-gray-800">Current password</label>
                  <input
                    id="profile-current-password"
                    type="password"
                    value={pwdCurrent}
                    onChange={(e) => setPwdCurrent(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="Enter current password"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="profile-new-password" className="font-medium text-gray-800">New password</label>
                  <input
                    id="profile-new-password"
                    type="password"
                    value={pwdNew}
                    onChange={(e) => setPwdNew(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="Enter new password"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="profile-confirm-password" className="font-medium text-gray-800">Confirm new password</label>
                  <input
                    id="profile-confirm-password"
                    type="password"
                    value={pwdConfirm}
                    onChange={(e) => setPwdConfirm(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="Re-enter new password"
                  />
                </div>

                {pwdError && <p className="text-[11px] font-medium text-red-600">{pwdError}</p>}
                {pwdSuccess && <p className="text-[11px] font-medium text-emerald-600">{pwdSuccess}</p>}

                <div className="mt-1 flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    className="rounded-full bg-yellow-500 px-4 py-1.5 font-semibold text-white shadow hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pwdSaving}
                  >
                    {pwdSaving ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 h-screen">
        <Sidebar items={participantNavigation} onLogout={handleLogout} logoutDisabled={isLoggingOut} />
      </div>

      <main className="flex-1 overflow-y-auto">
        <HeaderBar
          onToggleNotifications={() => setNotificationsOpen((prev) => !prev)}
          notificationsOpen={notificationsOpen}
          notificationsCount={notifications.filter((item) => !item.read).length}
          onOpenProfile={handleOpenProfile}
        />
        <div className="mx-auto max-w-6xl px-6 py-10">{children}</div>
      </main>

      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onClear={() => setNotifications([])}
        onNotificationClick={handleNotificationClick}
      />

      {toastNotification && (
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex max-w-sm flex-col gap-2 text-sm text-gray-900">
          <div
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border border-yellow-200 bg-white/95 px-4 py-3 shadow-lg shadow-yellow-100 transition-all duration-400 ease-out ${
              toastVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
            }`}
          >
            <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
              <span className="text-xs font-bold">!</span>
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">{toastNotification.title}</p>
              <p className="text-xs text-gray-800">{toastNotification.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
