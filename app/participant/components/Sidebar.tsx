'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, LucideIcon } from 'lucide-react';
import clsx from 'clsx';

type SidebarItem = {
  name: string;
  description: string;
  icon: LucideIcon;
  href: string;
};

type SidebarProps<T extends SidebarItem> = {
  items: readonly T[];
  onLogout?: () => void;
  logoutDisabled?: boolean;
};

export default function Sidebar<T extends SidebarItem>({ items, onLogout, logoutDisabled }: SidebarProps<T>) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 flex-col border-r border-yellow-100 bg-white/80 backdrop-blur lg:flex h-full">
      <div className="px-6 pb-6 pt-10">
        <h1 className="text-2xl font-bold text-gray-900">UniHub</h1>
        <p className="mt-1 text-sm text-gray-500">Participant Workspace</p>
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
                  ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-200'
                  : 'text-gray-600 hover:bg-yellow-100 hover:text-gray-900',
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-6 space-y-4 text-xs text-gray-400">
        <button
          type="button"
          onClick={onLogout}
          disabled={!onLogout || logoutDisabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-yellow-200 px-3 py-2 text-sm font-medium text-yellow-600 transition hover:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut className={`h-4 w-4 ${logoutDisabled ? 'animate-pulse' : ''}`} />
          Logout
        </button>
        <p>
          © {new Date().getFullYear()} UniHub Extension Services
        </p>
      </div>
    </aside>
  );
}
