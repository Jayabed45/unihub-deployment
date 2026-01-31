'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

interface JoinedActivity {
  projectId: string;
  projectName: string;
  activityId: number;
  activityTitle: string;
  status: 'registered' | 'present' | 'absent';
  updatedAt?: string;
}

export default function ParticipantProjectsPage() {
  const [participantEmail, setParticipantEmail] = useState<string | null>(null);
  const [activities, setActivities] = useState<JoinedActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [sidePanelProject, setSidePanelProject] = useState<{ projectId: string; projectName: string } | null>(null);
  const [sidePanelActivities, setSidePanelActivities] = useState<JoinedActivity[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('unihub-auth');
      if (!stored) return;
      const parsed = JSON.parse(stored) as { email?: string } | null;
      if (parsed?.email && typeof parsed.email === 'string') {
        setParticipantEmail(parsed.email);
      }
    } catch (readError) {
      console.error('Failed to read participant email from storage', readError);
    }
  }, []);

  const fetchJoinedActivities = async () => {
    if (!participantEmail) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `http://localhost:5000/api/projects/participant-activities?email=${encodeURIComponent(participantEmail)}`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load joined activities');
      }

      const data = (await res.json()) as JoinedActivity[];
      setActivities(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load joined activities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!participantEmail) return;
    fetchJoinedActivities();
  }, [participantEmail]);

  useEffect(() => {
    if (!participantEmail) return;

    const socket = io('http://localhost:5000');
    socketRef.current = socket;

    socket.on('notification:new', (payload: any) => {
      if (!payload || typeof payload.title !== 'string') {
        return;
      }

      const title = payload.title;
      const message: string | undefined = (payload as any).message;

      if (!message || !message.includes(participantEmail)) {
        return;
      }

      if (title === 'Activity join') {
        fetchJoinedActivities();
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [participantEmail]);

  const groupedByProject = useMemo(() => {
    if (activities.length === 0) return [] as Array<{ projectId: string; projectName: string; items: JoinedActivity[] }>;

    const map = new Map<string, { projectId: string; projectName: string; items: JoinedActivity[] }>();
    for (const activity of activities) {
      const existing = map.get(activity.projectId);
      if (existing) {
        existing.items.push(activity);
      } else {
        map.set(activity.projectId, {
          projectId: activity.projectId,
          projectName: activity.projectName,
          items: [activity],
        });
      }
    }

    return Array.from(map.values()).map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.activityId - b.activityId),
    }));
  }, [activities]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">My joined activities</h2>
        <p className="mt-1 text-sm text-gray-600">
          View the extension activities you have joined, grouped by project. Attendance will be managed by the project
          leader.
        </p>
      </div>

      {!participantEmail && (
        <div className="rounded-2xl border border-yellow-100 bg-white/60 p-6 text-sm text-gray-700 shadow-sm">
          <p className="text-gray-500">
            Your email could not be detected. Please sign out and log in again to see your joined activities.
          </p>
        </div>
      )}

      {participantEmail && loading && (
        <div className="rounded-2xl border border-yellow-100 bg-white/60 p-6 text-sm text-gray-700 shadow-sm">
          <p className="text-gray-500">Loading your joined activities…</p>
        </div>
      )}

      {participantEmail && error && !loading && (
        <div className="rounded-2xl border border-red-100 bg-red-50/80 p-6 text-sm text-red-700 shadow-sm">
          <p>{error}</p>
        </div>
      )}

      {participantEmail && !loading && !error && groupedByProject.length === 0 && (
        <div className="rounded-2xl border border-yellow-100 bg-white/60 p-6 text-sm text-gray-700 shadow-sm">
          <p className="text-gray-500">
            You have not joined any activities yet. Browse projects in the Feeds page and join activities to see them
            listed here.
          </p>
        </div>
      )}

      {participantEmail && !loading && !error && groupedByProject.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groupedByProject.map((group) => {
            const firstItem = group.items[0];
            const extraCount = group.items.length - 1;

            return (
              <section
                key={group.projectId}
                className="flex h-full flex-col rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-800 shadow-sm"
              >
                <header className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{group.projectName}</h3>
                    <p className="mt-0.5 text-[11px] text-gray-500">Activities you joined under this project.</p>
                  </div>
                </header>

                <ul className="mt-1 space-y-2 text-sm text-gray-800">
                  {firstItem && (
                    <li
                      key={`${firstItem.projectId}:${firstItem.activityId}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{firstItem.activityTitle}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          Activity #{firstItem.activityId + 1}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                          {
                            registered: 'border border-yellow-200 bg-white text-yellow-700',
                            present: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
                            absent: 'border border-red-200 bg-red-50 text-red-700',
                          }[firstItem.status]
                        }`}
                      >
                        {firstItem.status === 'registered'
                          ? 'Registered'
                          : firstItem.status === 'present'
                          ? 'Marked present'
                          : 'Marked absent'}
                      </span>
                    </li>
                  )}
                </ul>

                {extraCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSidePanelProject({ projectId: group.projectId, projectName: group.projectName });
                      setSidePanelActivities(group.items);
                      setSidePanelOpen(true);
                    }}
                    className="mt-2 self-start text-[11px] font-medium text-yellow-700 hover:underline"
                  >
                    See {extraCount} more activit{extraCount > 1 ? 'ies' : 'y'}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}

      {sidePanelOpen && sidePanelProject && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
          <div className="h-full w-full max-w-md border-l border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Joined activities</p>
                <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{sidePanelProject.projectName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSidePanelOpen(false)}
                className="rounded-full border border-gray-200 px-3 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="h-full overflow-y-auto px-4 py-3 text-sm text-gray-800">
              <ul className="space-y-2">
                {sidePanelActivities.map((activity) => (
                  <li
                    key={`${activity.projectId}:${activity.activityId}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{activity.activityTitle}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        Activity #{activity.activityId + 1}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${
                        {
                          registered: 'border border-yellow-200 bg-white text-yellow-700',
                          present: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
                          absent: 'border border-red-200 bg-red-50 text-red-700',
                        }[activity.status]
                      }`}
                    >
                      {activity.status === 'registered'
                        ? 'Registered'
                        : activity.status === 'present'
                        ? 'Marked present'
                        : 'Marked absent'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
