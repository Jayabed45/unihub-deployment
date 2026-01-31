'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, LucideIcon } from 'lucide-react';
import clsx from 'clsx';

import type { AdminNavItem } from '../navigation';

interface SidebarProps {
  items: readonly AdminNavItem[];
  onLogout?: () => void;
  logoutDisabled?: boolean;
}

export default function Sidebar({ items, onLogout, logoutDisabled }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 flex-col border-r border-amber-100 bg-white/80 backdrop-blur lg:flex h-full">
      <div className="px-6 pb-6 pt-10">
        <h1 className="text-2xl font-bold text-gray-900">UniHub</h1>
        <p className="mt-1 text-sm text-gray-500">Administrator Console</p>
      </div>
      <nav className="flex-1 space-y-1 px-4 mt-6">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                isActive
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-200'
                  : 'text-gray-600 hover:bg-amber-100 hover:text-gray-900'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-6 text-xs text-gray-400">
        <button
          type="button"
          onClick={onLogout}
          disabled={!onLogout || logoutDisabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-sm font-medium text-amber-600 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className={`h-4 w-4 ${logoutDisabled ? 'animate-pulse' : ''}`} />
          Logout
        </button>
        <p className="mt-4">© {new Date().getFullYear()} UniHub Admin</p>
      </div>
    </aside>
  );
}
