"use client";

import { useEffect, useState } from "react";
import { Users, ClipboardList, CheckCircle2, Signal, ChevronRight } from "lucide-react";

interface Project {
  _id: string;
  name: string;
  description: string;
  status?: "Pending" | "Approved" | "Rejected" | string;
}

interface User {
  _id: string;
  email: string;
  role: { name: string };
}

const AUTH_STORAGE_KEY = "unihub-auth";

export default function AdminDashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [metricSeries, setMetricSeries] = useState<{
    projectsDaily: number[];
    usersDaily: number[];
    pendingDaily: number[];
  } | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [projectsRes, usersRes, onlineRes, metricsRes] = await Promise.all([
          fetch("http://localhost:5000/api/projects"),
          fetch("http://localhost:5000/api/auth/users"),
          fetch("http://localhost:5000/api/auth/online-users"),
          fetch("http://localhost:5000/api/metrics/admin-stats?days=14"),
        ]);

        if (projectsRes.ok) {
          const data = (await projectsRes.json()) as Project[];
          setProjects(data);
        }

        if (usersRes.ok) {
          const data = (await usersRes.json()) as User[];
          setUsers(data);
        }

        if (onlineRes.ok) {
          const data = (await onlineRes.json()) as { userIds?: string[] };
          if (Array.isArray(data.userIds)) {
            setOnlineUserIds(data.userIds);
          }
        }

        if (metricsRes.ok) {
          const data = (await metricsRes.json()) as {
            totals: { totalProjects: number; pendingProjects: number; totalUsers: number; onlineNow: number };
            series: { dates: string[]; projectsDaily: number[]; usersDaily: number[]; pendingDaily: number[] };
          };
          setMetricSeries({
            projectsDaily: data.series.projectsDaily,
            usersDaily: data.series.usersDaily,
            pendingDaily: data.series.pendingDaily,
          });
        }
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // Read the current admin id so we can exclude it from stats/lists
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { id?: string } | null;
      if (parsed?.id) {
        setCurrentUserId(parsed.id);
      }
    } catch {
      // best-effort only
    }
  }, []);

  const totalProjects = projects.length;
  const pendingProjects = projects.filter((p) => (p.status || "Pending") === "Pending").length;

  const effectiveUsers = currentUserId
    ? users.filter((u) => u._id !== currentUserId)
    : users;

  const totalUsers = effectiveUsers.length;
  const onlineCount = effectiveUsers.filter((u) => onlineUserIds.includes(u._id)).length;

  const recentProjects = projects.slice(0, 5);
  const recentUsers = effectiveUsers.slice(0, 5);

  const statusCounts = projects.reduce(
    (acc, p) => {
      const k = (p.status || "Pending") as string;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const onlineVsOffline = [
    { label: "Online", value: onlineCount, color: "#10b981" },
    { label: "Offline", value: Math.max(totalUsers - onlineCount, 0), color: "#9ca3af" },
  ];

  const statusTone = (label: string) => {
    if (label === "Approved") return { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" };
    if (label === "Rejected") return { border: "border-rose-200", bg: "bg-rose-50", text: "text-rose-700" };
    if (label === "Pending") return { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700" };
    return { border: "border-indigo-200", bg: "bg-indigo-50", text: "text-indigo-700" };
  };

  const initialFrom = (s: string) => (s?.trim()?.charAt(0)?.toUpperCase() || "?");

  // Tiny deterministic series generators for card sparklines
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
      const drift = (rnd() - 0.5) * 0.3 * v; // +/- 15%
      v = Math.max(0, v + drift);
      arr.push(v);
    }
    return arr;
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-3xl border border-amber-100 bg-white/80 p-10 text-sm text-gray-700">
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-3xl border border-red-100 bg-white/80 p-10 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ClipboardList className="h-5 w-5" />}
          label="Total projects"
          value={totalProjects}
          trend={metricSeries?.projectsDaily || makeTrend('projects', totalProjects)}
          color="#f59e0b"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Pending approvals"
          value={pendingProjects}
          trend={metricSeries?.pendingDaily || makeTrend('pending', pendingProjects)}
          color="#f97316"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Total users"
          value={totalUsers}
          trend={metricSeries?.usersDaily || makeTrend('users', totalUsers)}
          color="#6366f1"
        />
        <StatCard
          icon={<Signal className="h-5 w-5" />}
          label="Online now"
          value={onlineCount}
          trend={makeTrend('online', onlineCount)}
          color="#22c55e"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-100 bg-white/80 p-6 lg:col-span-1">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Project status</h2>
            <p className="text-xs text-gray-500">Distribution across all projects.</p>
          </div>
          <DonutChart
            data={Object.entries(statusCounts).map(([label, value]) => ({
              label,
              value,
              color:
                label === "Approved"
                  ? "#22c55e"
                  : label === "Rejected"
                  ? "#ef4444"
                  : label === "Pending"
                  ? "#f59e0b"
                  : "#6366f1",
            }))}
          />
          <ul className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-700">
            {Object.entries(statusCounts).map(([label, value]) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      label === "Approved"
                        ? "#22c55e"
                        : label === "Rejected"
                        ? "#ef4444"
                        : label === "Pending"
                        ? "#f59e0b"
                        : "#6366f1",
                  }}
                />
                <span className="font-medium text-gray-900">{label}</span>
                <span className="ml-auto tabular-nums">{value}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-white/80 p-6 lg:col-span-2">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Users online</h2>
            <p className="text-xs text-gray-500">Live overview of online vs offline users.</p>
          </div>
          <BarRows data={onlineVsOffline} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-amber-100 bg-white/80 p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Recent projects</h2>
              <p className="text-xs text-gray-500">Latest proposals across the platform.</p>
            </div>
          </div>
          {recentProjects.length === 0 ? (
            <p className="text-sm text-gray-600">No projects have been created yet.</p>
          ) : (
            <ul className="space-y-2 text-sm text-gray-800">
              {recentProjects.map((project) => (
                <li
                  key={project._id}
                  className="group flex items-center justify-between rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-amber-200 hover:shadow"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-50 text-amber-700">
                      {initialFrom(project.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 line-clamp-1">{project.name}</p>
                      <p className="text-xs text-gray-600 line-clamp-2">{project.description}</p>
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    {(() => {
                      const label = project.status || "Pending";
                      const tone = statusTone(label);
                      return (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.border} ${tone.bg} ${tone.text}`}>
                          {label}
                        </span>
                      );
                    })()}
                    <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:text-gray-400" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-amber-100 bg-white/80 p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Recent users</h2>
              <p className="text-xs text-gray-500">Quick view of the most recent accounts.</p>
            </div>
          </div>
          {recentUsers.length === 0 ? (
            <p className="text-sm text-gray-600">No users found.</p>
          ) : (
            <ul className="space-y-2 text-sm text-gray-800">
              {recentUsers.map((user) => (
                <li
                  key={user._id}
                  className="group flex items-center justify-between rounded-xl border border-amber-100 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-amber-200 hover:shadow"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ${onlineUserIds.includes(user._id) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                      {initialFrom(user.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 line-clamp-1">{user.email}</p>
                      <p className="text-xs text-gray-600">{user.role?.name || "N/A"}</p>
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    {onlineUserIds.includes(user._id) ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        <span className="h-2 w-2 rounded-full bg-gray-400" />
                        Offline
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:text-gray-400" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  trend,
  color = "#f59e0b",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  trend?: number[];
  color?: string;
}) {
  const w = 96;
  const h = 36;
  const pad = 2;
  const series = (trend && trend.length > 1) ? trend : [value, value];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const scaleX = (i: number) => pad + (i * (w - pad * 2)) / (series.length - 1);
  const scaleY = (v: number) => {
    const range = max - min || 1;
    const norm = (v - min) / range;
    return h - pad - norm * (h - pad * 2);
  };
  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i)},${scaleY(v)}`).join(' ');
  const area = `${line} L${scaleX(series.length - 1)},${h - pad} L${scaleX(0)},${h - pad} Z`;

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-white/80 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          <p className="text-xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="-mr-1 hidden sm:block">
        <path d={area} fill={color + '22'} stroke="none" />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
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
          const circle = (
            <circle
              key={i}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return circle;
        })}
      </g>
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        className="fill-gray-900 text-sm font-semibold"
      >
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
