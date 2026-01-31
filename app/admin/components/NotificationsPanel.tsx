'use client';

import { BellRing, CheckCircle2, X } from 'lucide-react';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read?: boolean;
  projectId?: string;
}

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  notifications?: NotificationItem[];
  onClear?: () => void;
}

export default function NotificationsPanel({
  isOpen,
  onClose,
  notifications = [],
  onClear,
  onNotificationClick,
}: NotificationsPanelProps & { onNotificationClick?: (item: NotificationItem) => void }) {
  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-sm transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <header className="flex items-center justify-between border-b border-amber-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-500">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
            <p className="text-xs text-gray-500">Stay on top of project activity and system updates.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-amber-100 p-2 text-amber-500 transition hover:border-amber-200 hover:text-amber-600"
          aria-label="Close notifications"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
        {notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-100 bg-amber-50/50 p-6 text-center text-sm text-gray-500">
            You&apos;re all caught up! New updates will appear here.
          </div>
        ) : (
          notifications.map((item) => (
            <article
              key={item.id}
              onClick={() => onNotificationClick?.(item)}
              className={`cursor-pointer rounded-2xl border px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                item.read ? 'border-amber-50 bg-white' : 'border-amber-200 bg-amber-50/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                  <p className="text-sm text-gray-600">{item.message}</p>
                </div>
                {item.read ? (
                  <CheckCircle2 className="mt-1 h-4 w-4 text-emerald-500" />
                ) : (
                  <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-amber-500" />
                )}
              </div>
              <span className="mt-2 block text-xs uppercase tracking-wide text-gray-400">{item.timestamp}</span>
            </article>
          ))
        )}
      </div>

      {notifications.length > 0 && onClear ? (
        <footer className="border-t border-amber-100 px-6 py-4 text-right">
          <button
            type="button"
            onClick={onClear}
            className="rounded-full border border-amber-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-600 transition hover:bg-amber-50"
          >
            Clear notifications
          </button>
        </footer>
      ) : null}
    </div>
  );
}
