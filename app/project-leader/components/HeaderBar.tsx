'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Clock, Search, UserCircle2 } from 'lucide-react';

import { projectLeaderNavigation } from '../navigation';

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

interface HeaderBarProps {
  onToggleNotifications?: () => void;
  notificationsCount?: number;
  notificationsOpen?: boolean;
  onOpenProfile?: () => void;
}

export default function HeaderBar({
  onToggleNotifications,
  notificationsCount = 0,
  notificationsOpen,
  onOpenProfile,
}: HeaderBarProps) {
  const pathname = usePathname();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const title = useMemo(() => {
    const current = projectLeaderNavigation.find((item) =>
      pathname === item.href || pathname?.startsWith(`${item.href}/`)
    );

    return current?.name ?? 'Workspace';
  }, [pathname]);

  const timeLabel = timeFormatter.format(now);
  const dateLabel = dateFormatter.format(now);

  return (
    <header className="sticky top-0 z-30 border-b border-yellow-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold text-gray-900">{title}</h1>
        </div>

        <div className="hidden items-center gap-6 text-sm lg:flex">
          <label className="relative w-80 max-w-xs">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="search"
              placeholder="Search projects, participants, announcements..."
              className="w-full rounded-full border border-yellow-100 bg-white/70 py-3 pe-4 ps-11 text-sm text-gray-700 shadow-inner transition focus:border-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-200"
            />
          </label>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span>{timeLabel}</span>
              </div>
              <span className="text-xs text-gray-500">{dateLabel}</span>
            </div>
            <button
              type="button"
              onClick={onToggleNotifications}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-yellow-100 bg-white text-yellow-500 transition hover:-translate-y-0.5 hover:border-yellow-200 hover:shadow ${
                notificationsOpen ? 'ring-2 ring-yellow-300' : ''
              }`}
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {notificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {notificationsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-yellow-100 bg-white text-yellow-500 transition hover:-translate-y-0.5 hover:border-yellow-200 hover:shadow"
              aria-label="Your profile"
            >
              <UserCircle2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
