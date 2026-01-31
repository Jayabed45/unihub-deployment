'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users, 
  ClipboardList, 
  Bell, 
  ArrowRight
} from 'lucide-react';

interface Project {
  _id: string;
  name: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  participants: string[]; 
}

interface Notification {
  _id: string;
  title: string;
  message: string;
  createdAt: string;
}

export default function ProjectLeaderDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [newNotificationId, setNewNotificationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricSeries, setMetricSeries] = useState<{
    projectsDaily: number[];
    requestsDaily: number[];
    joinsDaily: number[];
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        let leaderId: string | undefined;
        let leaderEmail: string | undefined;

        try {
          const stored = window.localStorage.getItem('unihub-auth');
          if (stored) {
            const parsed = JSON.parse(stored) as { id?: string; email?: string; role?: string } | null;
            if (parsed?.role === 'Project Leader') {
              if (parsed.id) leaderId = parsed.id;
              if (parsed.email && typeof parsed.email === 'string') leaderEmail = parsed.email;
            }
          }
        } catch {
          // best-effort only; fall back to unfiltered endpoints
        }

        const projectParams = new URLSearchParams();
        if (leaderId) {
          projectParams.append('projectLeaderId', leaderId);
        }
        const projectsUrl = projectParams.toString()
          ? `http://localhost:5000/api/projects?${projectParams.toString()}`
          : 'http://localhost:5000/api/projects';

        const notifParams = new URLSearchParams();
        if (leaderId) notifParams.append('leaderId', leaderId);
        if (leaderEmail) notifParams.append('leaderEmail', leaderEmail);
        const notificationsUrl = notifParams.toString()
          ? `http://localhost:5000/api/notifications?${notifParams.toString()}`
          : 'http://localhost:5000/api/notifications';

        const metricsParams = new URLSearchParams();
        if (leaderId) metricsParams.append('leaderId', leaderId);
        if (leaderEmail) metricsParams.append('leaderEmail', leaderEmail);
        metricsParams.append('days', '14');
        const metricsUrl = `http://localhost:5000/api/metrics/leader-stats?${metricsParams.toString()}`;

        const [projectsRes, notificationsRes, metricsRes] = await Promise.all([
          fetch(projectsUrl),
          fetch(notificationsUrl),
          fetch(metricsUrl),
        ]);

        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          setProjects(projectsData);
        }

        if (notificationsRes.ok) {
          const notificationsData = await notificationsRes.json();
          setNotifications(notificationsData.slice(0, 5));

          const newestNotification = notificationsData[0];
          if (newestNotification) {
            const seenInfo = JSON.parse(localStorage.getItem('unihub-newest-notification-seen') || '{}');
            const twentyMinutes = 20 * 60 * 1000;

            if (seenInfo.id !== newestNotification._id) {
              localStorage.setItem('unihub-newest-notification-seen', JSON.stringify({ id: newestNotification._id, timestamp: Date.now() }));
              setNewNotificationId(newestNotification._id);
            } else {
              if (Date.now() - seenInfo.timestamp < twentyMinutes) {
                setNewNotificationId(newestNotification._id);
              }
            }
          }
        }

        if (metricsRes.ok) {
          const metricsData = (await metricsRes.json()) as {
            series: { dates: string[]; projectsDaily: number[]; requestsDaily: number[]; joinsDaily: number[] };
            projectCount: number;
          };
          setMetricSeries({
            projectsDaily: metricsData.series.projectsDaily,
            requestsDaily: metricsData.series.requestsDaily,
            joinsDaily: metricsData.series.joinsDaily,
          });
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const totalProjects = projects.length;
  const totalParticipants = projects.reduce((acc, project) => acc + (project.participants?.length || 0), 0);
  const pendingJoinRequests = notifications.filter(n => n.title === 'Join request').length;

  const statusCounts = projects.reduce((acc, p) => {
    const s = (p.status || '').toLowerCase();
    const label = s === 'approved' ? 'Approved' : s === 'rejected' ? 'Rejected' : 'Pending';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const activityBars = [
    { label: 'Join requests', value: metricSeries?.requestsDaily?.reduce((a, b) => a + b, 0) || 0, color: '#f59e0b' },
    { label: 'Activity joins', value: metricSeries?.joinsDaily?.reduce((a, b) => a + b, 0) || 0, color: '#22c55e' },
  ];

  // Lightweight deterministic series for card sparklines
  const seedRand = (seed: string) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const makeTrend = (key: string, base: number, len = 18) => {
    const rnd = seedRand(`${key}:${base}`);
    const arr: number[] = [];
    let v = Math.max(base, 1);
    for (let i = 0; i < len; i++) {
      const drift = (rnd() - 0.5) * 0.3 * v; // +/-15%
      v = Math.max(0, v + drift);
      arr.push(v);
    }
    return arr;
  };

  if (loading) {
    return <div className="text-center p-10">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<ClipboardList />} title="Total Projects" value={totalProjects} trend={metricSeries?.projectsDaily || makeTrend('pl-projects', totalProjects)} color="#f59e0b" />
        <StatCard icon={<Users />} title="Total Participants" value={totalParticipants} trend={metricSeries?.joinsDaily || makeTrend('pl-participants', totalParticipants)} color="#6366f1" />
        <StatCard icon={<Bell />} title="Pending Join Requests" value={pendingJoinRequests} trend={metricSeries?.requestsDaily || makeTrend('pl-requests', pendingJoinRequests)} color="#22c55e" />
      </div>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-100 bg-white/80 p-6 lg:col-span-1">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Project status</h2>
            <p className="text-xs text-gray-500">Distribution across your projects.</p>
          </div>
          <DonutChart
            data={Object.entries(statusCounts).map(([label, value]) => ({
              label,
              value,
              color: label === 'Approved' ? '#22c55e' : label === 'Rejected' ? '#ef4444' : '#f59e0b',
            }))}
          />
          <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-700">
            {Object.entries(statusCounts).map(([label, value]) => (
              <li key={label} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label === 'Approved' ? '#22c55e' : label === 'Rejected' ? '#ef4444' : '#f59e0b' }} />
                <span className="font-medium text-gray-900">{label}</span>
                <span className="ml-auto tabular-nums">{value}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-white/80 p-6 lg:col-span-2">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
            <p className="text-xs text-gray-500">Requests and joins in the last 14 days.</p>
          </div>
          <BarRows data={activityBars} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-semibold text-gray-800">My Projects</h2>
          <div className="space-y-4">
            {projects.map(project => (
              <ProjectCard key={project._id} project={project} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-gray-800">Recent Activity</h2>
          <div className="space-y-4">
            {notifications.map(notification => (
              <NotificationItem key={notification._id} notification={notification} isNew={notification._id === newNotificationId} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, trend, color = '#f59e0b' }: { icon: React.ReactNode; title: string; value: number; trend?: number[]; color?: string }) {
  const w = 96;
  const h = 36;
  const pad = 2;
  const series = (trend && trend.length > 1) ? trend : [value, value];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const sx = (i: number) => pad + (i * (w - pad * 2)) / (series.length - 1);
  const sy = (v: number) => {
    const range = max - min || 1;
    const norm = (v - min) / range;
    return h - pad - norm * (h - pad * 2);
  };
  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i)},${sy(v)}`).join(' ');
  const area = `${line} L${sx(series.length - 1)},${h - pad} L${sx(0)},${h - pad} Z`;

  return (
    <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-4">
      <div className="flex items-center space-x-4">
        <div className="bg-yellow-100 text-yellow-600 p-3 rounded-full">
          {icon}
        </div>
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="hidden sm:block">
        <path d={area} fill={color + '22'} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:-translate-y-0.5 hover:shadow-md transition">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800 line-clamp-2">{project.name}</h3>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
        </div>
        {(() => {
          const s = (project.status || '').toLowerCase();
          const label = s === 'approved' ? 'Approved' : s === 'rejected' ? 'Rejected' : 'Pending';
          const tone = s === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : s === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700';
          return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>;
        })()}
      </div>
      <div className="flex justify-between items-center mt-4">
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Users size={16} />
          <span>{project.participants?.length || 0} Participants</span>
        </div>
      </div>
    </div>
  );
}

function NotificationItem({ notification, isNew }: { notification: Notification; isNew: boolean }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm text-gray-800">{notification.title}</p>
        {isNew && (
          <span className="animate-pulse bg-emerald-100 text-emerald-700 text-xs font-semibold px-2 py-1 rounded-full">
            New
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1">{notification.message}</p>
      <p className="text-xs text-gray-400 mt-2">{new Date(notification.createdAt).toLocaleString()}</p>
    </div>
  );
}

function DonutChart({
  data,
  size = 160,
  thickness = 20,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = size / 2 - thickness / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto block">
      <g transform={`translate(${size / 2}, ${size / 2})`}>
        <circle r={radius} fill="none" stroke="#f3f4f6" strokeWidth={thickness} />
        {data.map((d, i) => {
          const fraction = d.value / total;
          const dash = circumference * fraction;
          const el = (
            <circle
              key={i}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          );
          offset += dash;
          return el;
        })}
      </g>
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="fill-gray-900 text-sm font-semibold">
        {total}
      </text>
    </svg>
  );
}

function BarRows({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = Math.round((d.value / total) * 100);
        return (
          <div key={d.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-gray-900">{d.label}</span>
              <span className="tabular-nums text-gray-600">{d.value} ({pct}%)</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full" style={{ width: `${pct}%`, backgroundColor: d.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
