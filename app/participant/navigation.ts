import { LayoutGrid, FolderKanban } from 'lucide-react';

export const participantNavigation = [
  {
    name: 'Feeds',
    description: 'Announcements and featured extension opportunities.',
    icon: LayoutGrid,
    href: '/participant/Feeds',
  },
  {
    name: 'Projects',
    description: 'Browse and join approved projects and activities.',
    icon: FolderKanban,
    href: '/participant/Projects',
  },
] as const;

export type ParticipantNavItem = (typeof participantNavigation)[number];
