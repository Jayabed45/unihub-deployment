import {
  LayoutGrid,
  FolderKanban,
  Users,
} from 'lucide-react';

export const projectLeaderNavigation = [
  {
    name: 'Dashboard',
    description: 'Overview of ongoing projects and quick stats.',
    icon: LayoutGrid,
    href: '/project-leader/dashboard',
  },
  {
    name: 'Projects',
    description: 'Create, update, and manage extension projects and activities.',
    icon: FolderKanban,
    href: '/project-leader/projects',
  },
  {
    name: 'Participants',
    description: 'View beneficiary rosters and manage communications.',
    icon: Users,
    href: '/project-leader/participants',
  },
] as const;

export type ProjectLeaderNavItem = (typeof projectLeaderNavigation)[number];
