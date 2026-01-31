'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

interface ParticipantProject {
  _id: string;
  name: string;
  description: string;
  status?: 'Pending' | 'Approved' | 'Rejected' | string;
}

interface ProjectActivity {
  activityId: number;
  title: string;
  hours?: string;
  resourcePerson?: string;
  startAt?: string | null;
  endAt?: string | null;
  location?: string | null;
}

type EvaluationRating = 1 | 2 | 3 | 4;

interface EvaluationItem {
  id: string;
  label: string;
}

interface EvaluationSection {
  id: string;
  title: string;
  items: EvaluationItem[];
}

const evaluationSections: EvaluationSection[] = [
  {
    id: 'A',
    title: 'Attainment of Objectives (Pag-abot sa tumong)',
    items: [
      {
        id: 'A1',
        label:
          'The objectives of the training/workshop were clearly stated and shared before the start of the activity.',
      },
      {
        id: 'A2',
        label: 'The objectives of the training/workshop were fully attained at the end of the activity.',
      },
      {
        id: 'A3',
        label: 'The activity addressed the needs and concerns of the program/beneficiaries.',
      },
    ],
  },
  {
    id: 'B',
    title: 'Content (Unod sa nilalaman)',
    items: [
      {
        id: 'B1',
        label: 'The content of the training/workshop was relevant to the topic and to the participants.',
      },
      {
        id: 'B2',
        label: 'The content was organized and easy to understand.',
      },
      {
        id: 'B3',
        label: 'The examples and activities helped me understand the topic better.',
      },
    ],
  },
  {
    id: 'C',
    title: 'Resource Person / Facilitator (Magwawali / Tigpatuman)',
    items: [
      {
        id: 'C1',
        label: 'The resource person/facilitator was knowledgeable about the topic discussed.',
      },
      {
        id: 'C2',
        label: 'The resource person/facilitator explained the topic clearly.',
      },
      {
        id: 'C3',
        label: 'The resource person/facilitator encouraged participation and answered questions well.',
      },
    ],
  },
  {
    id: 'D',
    title: 'Methods / Strategies Used (Pamaagi sa pagtudlo)',
    items: [
      {
        id: 'D1',
        label: 'The methods/strategies used made the session interesting and engaging.',
      },
      {
        id: 'D2',
        label: 'The activities allowed me to apply what I have learned.',
      },
    ],
  },
  {
    id: 'E',
    title: 'Logistics and Support (Mga kahikayan sa kalihukan)',
    items: [
      {
        id: 'E1',
        label: 'The venue, schedule, and materials provided were appropriate and adequate.',
      },
      {
        id: 'E2',
        label: 'Overall coordination and facilitation of the activity were efficient and well-organized.',
      },
    ],
  },
  {
    id: 'F',
    title: 'Overall Evaluation (Kinatas-ang pagsusi sa tibuok kalihukan)',
    items: [
      {
        id: 'F1',
        label: 'Overall, I am satisfied with this extension project/program activity.',
      },
    ],
  },
];

export default function ParticipantFeedsPage() {
  const [projects, setProjects] = useState<ParticipantProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantEmail, setParticipantEmail] = useState<string | null>(null);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinModalProject, setJoinModalProject] = useState<ParticipantProject | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinStatusByProject, setJoinStatusByProject] = useState<Record<string, 'pending'>>({});
  const [joinedStatusByProject, setJoinedStatusByProject] = useState<Record<string, 'joined'>>({});
  const [activitiesModalOpen, setActivitiesModalOpen] = useState(false);
  const [activitiesModalProject, setActivitiesModalProject] = useState<ParticipantProject | null>(null);
  const [activitiesForModal, setActivitiesForModal] = useState<ProjectActivity[]>([]);
  const [activityDetailOpen, setActivityDetailOpen] = useState(false);
  const [activityDetailActivity, setActivityDetailActivity] = useState<ProjectActivity | null>(null);
  const [activityDetailIndex, setActivityDetailIndex] = useState<number | null>(null);
  const [activityJoinLoading, setActivityJoinLoading] = useState(false);
  const [activityJoinError, setActivityJoinError] = useState<string | null>(null);
  const [activityJoinStatusByKey, setActivityJoinStatusByKey] = useState<Record<string, 'joined'>>({});
  const [joinedActivitiesMeta, setJoinedActivitiesMeta] = useState<
    Record<
      string,
      {
        projectId: string;
        projectName: string;
        activityId: number;
        activityTitle: string;
        startAt?: string | null;
        endAt?: string | null;
        location?: string | null;
      }
    >
  >({});
  const [surveyModalOpen, setSurveyModalOpen] = useState(false);
  const [surveyProjectName, setSurveyProjectName] = useState('');
  const [surveyActivityTitle, setSurveyActivityTitle] = useState('');
  const [surveyDateLabel, setSurveyDateLabel] = useState('');
  const [surveyCollegeDept, setSurveyCollegeDept] = useState('');
  const [surveyRatings, setSurveyRatings] = useState<Record<string, EvaluationRating | null>>({});
  const [surveyComments, setSurveyComments] = useState('');
  const [surveySuggestions, setSurveySuggestions] = useState('');
  const [surveyProjectId, setSurveyProjectId] = useState<string | null>(null);
  const [surveyActivityId, setSurveyActivityId] = useState<number | null>(null);
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [surveySubmittedMessage, setSurveySubmittedMessage] = useState<string | null>(null);

  const createReminderNotification = async (title: string, message: string, projectId?: string) => {
    try {
      const res = await fetch('http://localhost:5000/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          message,
          project: projectId,
          recipientEmail: participantEmail || undefined,
        }),
      });

      if (!res.ok) {
        // Best-effort only; reminders still show as popups even if notification write fails
        console.error('Failed to persist reminder notification');
      }
    } catch (error) {
      console.error('Failed to create reminder notification', error);
    }
  };

  const openSurveyForMeta = (meta: {
    projectId: string;
    projectName: string;
    activityId: number;
    activityTitle: string;
    endAt?: string | null;
  }) => {
    const endMs = meta.endAt ? new Date(meta.endAt).getTime() : NaN;
    const dateLabel = Number.isFinite(endMs)
      ? new Date(endMs).toLocaleDateString('en-PH', {
          dateStyle: 'medium',
        })
      : '';

    setSurveyProjectId(meta.projectId);
    setSurveyActivityId(meta.activityId);
    setSurveyProjectName(meta.projectName);
    setSurveyActivityTitle(meta.activityTitle);
    setSurveyDateLabel(dateLabel);
    setSurveyCollegeDept('');
    setSurveyRatings({});
    setSurveyComments('');
    setSurveySuggestions('');
    setSurveyError(null);
    setSurveySubmittedMessage(null); // Reset message on open
    setSurveyModalOpen(true);

    if (!participantEmail) {
      return;
    }

    const emailForFetch = participantEmail;

    fetch(
      `http://localhost:5000/api/projects/${encodeURIComponent(
        meta.projectId,
      )}/activities/${meta.activityId}/evaluations?email=${encodeURIComponent(emailForFetch)}`,
    )
      .then((res) => {
        if (!res.ok) {
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data || !Array.isArray(data) || data.length === 0) {
          // No previous submission, show the form as-is.
          return;
        }

        // A submission already exists.
        setSurveySubmittedMessage('You have already submitted the evaluation for this activity.');
      })
      .catch((error) => {
        console.error('Failed to load existing activity evaluation', error);
      });
  };

  const handleSubmitSurvey = async () => {
    if (!surveyProjectId || surveyActivityId === null || !participantEmail) {
      setSurveyModalOpen(false);
      return;
    }

    const ratingsPayload: Record<string, number> = {};
    Object.entries(surveyRatings).forEach(([key, value]) => {
      if (typeof value === 'number') {
        ratingsPayload[key] = value;
      }
    });

    const payload = {
      email: participantEmail,
      collegeDept: surveyCollegeDept,
      ratings: ratingsPayload,
      comments: surveyComments,
      suggestions: surveySuggestions,
    };

    setSurveySubmitting(true);
    setSurveyError(null);

    try {
      const res = await fetch(
        `http://localhost:5000/api/projects/${encodeURIComponent(
          surveyProjectId,
        )}/activities/${surveyActivityId}/evaluations`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSurveyError(data.message || 'Failed to submit evaluation. Please try again.');
        return;
      }

      setSurveyModalOpen(false);
    } catch (error) {
      console.error('Failed to submit activity evaluation', error);
      setSurveyError('Failed to submit evaluation. Please check your connection and try again.');
    } finally {
      setSurveySubmitting(false);
    }
  };

  const [activityReminder, setActivityReminder] = useState<
    | {
        type: 'prestart' | 'start' | 'end';
        projectName: string;
        activityTitle: string;
        message: string;
      }
    | null
  >(null);
  const reminderTimeoutsRef = useRef<number[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const socketRef = useRef<Socket | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('http://localhost:5000/api/projects');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load projects');
      }
      const data = (await res.json()) as ParticipantProject[];
      setProjects(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const activityDetailIsExpired = useMemo(() => {
    if (!activityDetailActivity?.endAt) return false;
    const d = new Date(activityDetailActivity.endAt);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() < nowMs;
  }, [activityDetailActivity, nowMs]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    fetchProjects();
  }, []);

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

  const fetchPendingFromNotifications = async () => {
    if (!participantEmail) return;

    try {
      const res = await fetch('http://localhost:5000/api/notifications');
      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as Array<{
        _id: string;
        title: string;
        message: string;
        project?: string;
        read?: boolean;
      }>;

      const pendingByProject: Record<string, 'pending'> = {};
      const joinedByProject: Record<string, 'joined'> = {};

      data.forEach((item) => {
        const rawMessage = item.message || '';
        if (!item.project || !rawMessage) return;

        if (item.title === 'Join request' && item.read !== true) {
          const emailFromMessage = rawMessage.endsWith(' wants to join')
            ? rawMessage.replace(' wants to join', '').trim()
            : rawMessage.trim();

          if (emailFromMessage && emailFromMessage === participantEmail) {
            pendingByProject[item.project] = 'pending';
          }
        } else if (item.title === 'Join request approved') {
          if (participantEmail && rawMessage.includes(participantEmail)) {
            joinedByProject[item.project] = 'joined';
          }
        }
      });

      setJoinStatusByProject(pendingByProject);
      setJoinedStatusByProject(joinedByProject);
    } catch (notifError) {
      console.error('Failed to load pending join requests for participant', notifError);
    }
  };

  useEffect(() => {
    if (!participantEmail) return;
    fetchPendingFromNotifications();
  }, [participantEmail]);

  const processActivityEvalIntent = () => {
    if (!participantEmail) return;

    try {
      const raw = window.localStorage.getItem('unihub-activity-eval-intent');
      if (!raw) return;

      const parsed = JSON.parse(raw) as
        | {
            projectId?: string;
            projectName?: string;
            activityTitle?: string;
            email?: string;
          }
        | null;

      if (!parsed) return;

      const allMetas = Object.values(joinedActivitiesMeta);

      let target = null as
        | {
            projectId: string;
            projectName: string;
            activityId: number;
            activityTitle: string;
            startAt?: string | null;
            endAt?: string | null;
          }
        | null;

      if (parsed.projectId && parsed.activityTitle) {
        target = allMetas.find(
          (meta) => meta.projectId === parsed.projectId && meta.activityTitle === parsed.activityTitle,
        ) as any;
      }

      if (!target && parsed.projectName && parsed.activityTitle) {
        target = allMetas.find(
          (meta) => meta.projectName === parsed.projectName && meta.activityTitle === parsed.activityTitle,
        ) as any;
      }

      if (target) {
        openSurveyForMeta(target);
        window.localStorage.removeItem('unihub-activity-eval-intent');
      }
    } catch (error) {
      console.error('Failed to process activity evaluation intent from storage', error);
    }
  };

  useEffect(() => {
    processActivityEvalIntent();
  }, [joinedActivitiesMeta, participantEmail]);

  useEffect(() => {
    const handler = () => {
      processActivityEvalIntent();
    };

    window.addEventListener('unihub-activity-eval-intent', handler);

    return () => {
      window.removeEventListener('unihub-activity-eval-intent', handler);
    };
  }, [joinedActivitiesMeta, participantEmail]);

  const fetchJoinedActivities = async () => {
    if (!participantEmail) return;

    try {
      const res = await fetch(
        `http://localhost:5000/api/projects/participant-activities?email=${encodeURIComponent(participantEmail)}`,
      );
      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as Array<{
        projectId: string;
        projectName: string;
        activityId: number;
        activityTitle: string;
        startAt?: string | null;
        endAt?: string | null;
        location?: string | null;
      }>;

      const joinedMap: Record<string, 'joined'> = {};
      const metaMap: Record<
        string,
        {
          projectId: string;
          projectName: string;
          activityId: number;
          activityTitle: string;
          startAt?: string | null;
          endAt?: string | null;
          location?: string | null;
        }
      > = {};

      data.forEach((item) => {
        const key = `${item.projectId}:${item.activityId}`;
        joinedMap[key] = 'joined';
        metaMap[key] = {
          projectId: item.projectId,
          projectName: item.projectName,
          activityId: item.activityId,
          activityTitle: item.activityTitle,
          startAt: item.startAt,
          endAt: item.endAt,
          location: item.location,
        };
      });

      if (Object.keys(joinedMap).length > 0) {
        setActivityJoinStatusByKey((prev) => ({ ...prev, ...joinedMap }));
        setJoinedActivitiesMeta((prev) => ({ ...prev, ...metaMap }));
      }
    } catch (err) {
      console.error('Failed to load joined activities for participant', err);
    }
  };

  useEffect(() => {
    if (!participantEmail) return;
    fetchJoinedActivities();
  }, [participantEmail]);

  useEffect(() => {
    // Clear previous timers
    reminderTimeoutsRef.current.forEach((id) => {
      window.clearTimeout(id);
    });
    reminderTimeoutsRef.current = [];

    const now = Date.now();

    Object.values(joinedActivitiesMeta).forEach((meta) => {
      const { projectName, activityTitle, startAt, endAt } = meta;

      const startMs = startAt ? new Date(startAt).getTime() : NaN;
      const endMs = endAt ? new Date(endAt).getTime() : NaN;

      const hasStart = Number.isFinite(startMs);
      const hasEnd = Number.isFinite(endMs);

      if (hasStart && startMs > now) {
        const thirtyMinutesBefore = startMs - 30 * 60 * 1000;
        const tenMinutesBefore = startMs - 10 * 60 * 1000;

        const events: Array<{ at: number; type: 'prestart' | 'start'; message: string }> = [
          {
            at: thirtyMinutesBefore,
            type: 'prestart',
            message: 'This activity will start in about 30 minutes.',
          },
          {
            at: tenMinutesBefore,
            type: 'prestart',
            message: 'This activity will start in about 10 minutes.',
          },
          {
            at: startMs,
            type: 'start',
            message: 'This activity is starting now.',
          },
        ];

        events.forEach((event) => {
          if (event.at <= now) return;
          const timeoutId = window.setTimeout(() => {
            const reminder = {
              type: event.type as 'prestart' | 'start',
              projectName,
              activityTitle,
              message: event.message,
            };
            setActivityReminder(reminder);
            // Create a notification for this reminder
            createReminderNotification(
              `Activity ${event.type === 'start' ? 'Started' : 'Starting Soon'}`,
              `[${projectName}] ${activityTitle}: ${event.message}`,
              meta.projectId
            );
          }, event.at - now);
          reminderTimeoutsRef.current.push(timeoutId);
        });
      }

      if (hasEnd && endMs > now) {
        const tenMinutesBeforeEnd = endMs - 10 * 60 * 1000;

        if (tenMinutesBeforeEnd > now) {
          const preEndTimeoutId = window.setTimeout(() => {
            const reminder = {
              type: 'end' as const,
              projectName,
              activityTitle,
              message: 'This activity will end in about 10 minutes.',
            };
            setActivityReminder(reminder);
            // Create a notification for this reminder
            createReminderNotification(
              'Activity Ending Soon',
              `[${projectName}] ${activityTitle}: This activity will end in about 10 minutes.`,
              meta.projectId
            );
          }, tenMinutesBeforeEnd - now);
          reminderTimeoutsRef.current.push(preEndTimeoutId);
        }

        const timeoutId = window.setTimeout(() => {
          const reminder = {
            type: 'end' as const,
            projectName,
            activityTitle,
            message: 'This activity has ended.',
          };
          setActivityReminder(reminder);

          openSurveyForMeta({
            projectId: meta.projectId,
            projectName,
            activityId: meta.activityId,
            activityTitle,
            endAt,
          });

          // Create notifications for this reminder and the evaluation prompt
          createReminderNotification(
            'Activity Ended',
            `[${projectName}] ${activityTitle}: This activity has ended.`,
            meta.projectId,
          );
          createReminderNotification(
            'Activity Evaluation',
            `[${projectName}] ${activityTitle}: Please complete the evaluation form for this activity.`,
            meta.projectId,
          );
        }, endMs - now);
        reminderTimeoutsRef.current.push(timeoutId);
      }
    });

    return () => {
      reminderTimeoutsRef.current.forEach((id) => {
        window.clearTimeout(id);
      });
      reminderTimeoutsRef.current = [];
    };
  }, [joinedActivitiesMeta, participantEmail]);

  useEffect(() => {
    const socket = io('http://localhost:5000');
    socketRef.current = socket;

    socket.on('notification:new', (payload: any) => {
      if (!payload || typeof payload.title !== 'string') {
        return;
      }

      const title = payload.title;
      const message: string | undefined = (payload as any).message;
      const projectIdFromPayload: string | undefined = (payload as any).projectId;
      const recipientEmailFromPayload: string | undefined = (payload as any).recipientEmail;

      if (title === 'New project created' || title === 'Project approved') {
        fetchProjects();
        return;
      }

      let currentEmail = participantEmail;
      if (!currentEmail) {
        try {
          const stored = window.localStorage.getItem('unihub-auth');
          if (stored) {
            const parsed = JSON.parse(stored) as { email?: string } | null;
            if (parsed?.email && typeof parsed.email === 'string') {
              currentEmail = parsed.email;
            }
          }
        } catch {
          // ignore storage read errors for realtime updates
        }
      }

      const isScheduleUpdate = title === 'Activity schedule updated';

      if (!isScheduleUpdate) {
        if (!message || !currentEmail || !message.includes(currentEmail)) {
          return;
        }
      } else {
        // For schedule updates, rely on recipientEmail from payload when available
        if (recipientEmailFromPayload && currentEmail && recipientEmailFromPayload !== currentEmail) {
          return;
        }
      }

      if (
        title === 'Join request' ||
        title === 'Join request approved' ||
        title === 'Activity join' ||
        title === 'Activity schedule updated'
      ) {
        fetchPendingFromNotifications();
        fetchJoinedActivities();

        // If the participant currently has the activities drawer open for this project,
        // refresh the list so schedule/location changes appear in real time.
        if (
          title === 'Activity schedule updated' &&
          activitiesModalOpen &&
          activitiesModalProject &&
          projectIdFromPayload &&
          activitiesModalProject._id === projectIdFromPayload
        ) {
          const project = projects.find((p) => p._id === projectIdFromPayload);
          if (project) {
            openActivitiesModal(project).catch(() => {
              // best-effort only
            });
          }
        }
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const approvedProjects = projects.filter((project) => project.status === 'Approved');

  const openActivitiesModal = async (project: ParticipantProject) => {
    try {
      const res = await fetch(`http://localhost:5000/api/projects/${project._id}`);
      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as any;
      const trainingSnapshot = data && data.proposalData && data.proposalData['training-design'];

      let parsed: ProjectActivity[] = [];

      const schedule: Array<{ activityId: number; startAt?: string; endAt?: string; location?: string | null }> =
        Array.isArray((data as any)?.activitySchedule)
          ? (((data as any).activitySchedule as any[]) || []).map((item) => ({
              activityId: Number((item as any).activityId),
              startAt: (item as any).startAt as string | undefined,
              endAt: (item as any).endAt as string | undefined,
              location: typeof (item as any).location === 'string' ? ((item as any).location as string) : undefined,
            }))
          : [];

      if (trainingSnapshot && Array.isArray(trainingSnapshot.editableCells)) {
        const cells: string[] = trainingSnapshot.editableCells;
        let activityIndexCounter = 0;

        for (let i = 0; i + 1 < cells.length; i += 2) {
          const title = (cells[i] || '').trim();
          const resourcePerson = (cells[i + 1] || '').trim();
          if (!title) continue;

          const scheduleEntry = schedule.find((item) => item.activityId === activityIndexCounter);

          parsed.push({
            activityId: activityIndexCounter,
            title,
            resourcePerson: resourcePerson || undefined,
            startAt: scheduleEntry?.startAt ?? null,
            endAt: scheduleEntry?.endAt ?? null,
            location: scheduleEntry?.location ?? null,
          });

          activityIndexCounter += 1;
        }
      }

      // Append any saved extension activities as additional entries so participants can see them
      try {
        const existingExt: Array<{ topic?: string; hours?: number | null; resourcePerson?: string }> =
          Array.isArray((data as any)?.extensionActivities) ? (data as any).extensionActivities : [];

        if (existingExt.length > 0) {
          let nextActivityId = parsed.length
            ? parsed.reduce((max, item) => (item.activityId > max ? item.activityId : max), parsed[0].activityId) + 1
            : 0;

          existingExt.forEach((item, index) => {
            const rawTopic = typeof item.topic === 'string' ? item.topic.trim() : '';
            const title = rawTopic || `Extension activity ${index + 1}`;

            if (!title) return;

            const resourcePerson =
              typeof item.resourcePerson === 'string' && item.resourcePerson.trim()
                ? item.resourcePerson.trim()
                : undefined;

            const scheduleEntry = schedule.find((entry) => entry.activityId === nextActivityId);

            parsed.push({
              activityId: nextActivityId,
              title,
              resourcePerson,
              startAt: scheduleEntry?.startAt ?? null,
              endAt: scheduleEntry?.endAt ?? null,
              location: scheduleEntry?.location ?? null,
            });

            nextActivityId += 1;
          });
        }
      } catch {
        // ignore extension parsing errors
      }

      setActivitiesForModal(parsed);
      setActivitiesModalProject(project);
      setActivitiesModalOpen(true);
    } catch (e) {
      console.error('Failed to load activities for participant view', e);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Projects</h2>
        <p className="mt-1 text-sm text-gray-600">
          Browse approved extension projects and activities that you can join as a beneficiary.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl border border-yellow-100 bg-white/60 p-6 text-sm text-gray-700 shadow-sm">
          <p className="text-gray-500">Loading projects…</p>
        </div>
      )}
      {surveyModalOpen && (
        <div
          className="fixed inset-0 z-70 flex h-screen items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-yellow-100 bg-white p-6 text-sm text-gray-800 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-500">
                  Extension Project / Program Evaluation
                </p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 line-clamp-2">{surveyActivityTitle}</h3>
                <p className="mt-0.5 text-[11px] text-gray-600 line-clamp-1">Project: {surveyProjectName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSurveyModalOpen(false)}
                className="rounded-full border border-yellow-200 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-50"
              >
                Close
              </button>
            </div>

            {surveySubmittedMessage ? (
              <div className="py-8 text-center">
                <p className="text-base text-gray-700">{surveySubmittedMessage}</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 text-xs">
                  <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="font-medium text-gray-800">Name of the Project / Program:</p>
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-800">
                    {surveyProjectName || '—'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-gray-800">Name of the Activity:</p>
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-800">
                    {surveyActivityTitle || '—'}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-gray-800" htmlFor="survey-college">
                    College / Department:
                  </label>
                  <input
                    id="survey-college"
                    type="text"
                    value={surveyCollegeDept}
                    onChange={(e) => setSurveyCollegeDept(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="e.g. College of Teacher Education"
                  />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-gray-800">Date:</p>
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-800">
                    {surveyDateLabel || '—'}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-1">
                <p className="text-[11px] text-gray-700">
                  Please check the column that corresponds to your rating.
                </p>
                <p className="text-[11px] font-medium text-gray-800">Rating guide:</p>
                <p className="text-[11px] text-gray-700">
                  <span className="font-semibold">4 – Very Good</span> &nbsp;|&nbsp;
                  <span className="font-semibold">3 – Good</span> &nbsp;|&nbsp;
                  <span className="font-semibold">2 – Fair</span> &nbsp;|&nbsp;
                  <span className="font-semibold">1 – Poor</span>
                </p>
              </div>

              <div className="mt-3 overflow-x-auto rounded-xl border border-yellow-100 bg-yellow-50/40">
                <table className="min-w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-yellow-100/80 text-gray-800">
                      <th className="border border-yellow-200 px-3 py-2 text-left font-semibold">Criteria of Evaluation</th>
                      <th className="w-12 border border-yellow-200 px-2 py-2 text-center font-semibold">4</th>
                      <th className="w-12 border border-yellow-200 px-2 py-2 text-center font-semibold">3</th>
                      <th className="w-12 border border-yellow-200 px-2 py-2 text-center font-semibold">2</th>
                      <th className="w-12 border border-yellow-200 px-2 py-2 text-center font-semibold">1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluationSections.map((section) => (
                      <Fragment key={section.id}>
                        <tr className="bg-yellow-50/80">
                          <td
                            className="border border-yellow-200 px-3 py-2 text-left font-semibold text-gray-900"
                            colSpan={5}
                          >
                            {section.id}. {section.title}
                          </td>
                        </tr>
                        {section.items.map((item) => {
                          const current = surveyRatings[item.id] ?? null;
                          return (
                            <tr key={item.id} className="bg-white/80">
                              <td className="border border-yellow-200 px-3 py-2 align-top text-gray-800">
                                <span className="mr-1 font-semibold">{item.id.replace(/^[A-Z]/, section.id + '.')}</span>
                                {item.label}
                              </td>
                              {[4, 3, 2, 1].map((val) => (
                                <td
                                  key={val}
                                  className="border border-yellow-200 px-2 py-2 text-center align-middle"
                                >
                                  <input
                                    type="radio"
                                    name={item.id}
                                    value={val}
                                    checked={current === val}
                                    onChange={() =>
                                      setSurveyRatings((prev) => ({
                                        ...prev,
                                        [item.id]: val as EvaluationRating,
                                      }))
                                    }
                                    className="h-3 w-3 text-yellow-500 focus:ring-yellow-400"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="survey-comments" className="text-[11px] font-medium text-gray-800">
                    Comments / Observations:
                  </label>
                  <textarea
                    id="survey-comments"
                    rows={3}
                    value={surveyComments}
                    onChange={(e) => setSurveyComments(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="Write any comments or observations about the activity."
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="survey-suggestions" className="text-[11px] font-medium text-gray-800">
                    Suggestions / Recommendations:
                  </label>
                  <textarea
                    id="survey-suggestions"
                    rows={3}
                    value={surveySuggestions}
                    onChange={(e) => setSurveySuggestions(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] text-gray-800 focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                    placeholder="Write your suggestions to improve future activities."
                  />
                </div>
              </div>

              {surveyError && (
                <p className="mt-2 text-[11px] font-medium text-red-600">{surveyError}</p>
              )}

              <div className="mt-4 flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSurveyModalOpen(false)}
                  className="rounded-full border border-yellow-200 px-3 py-1 font-semibold text-yellow-700 hover:bg-yellow-50"
                  disabled={surveySubmitting}
                >
                  Not now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // For now, just close the modal; responses are kept client-side only
                    handleSubmitSurvey();
                  }}
                  className="rounded-full bg-yellow-500 px-4 py-1.5 font-semibold text-white shadow hover:bg-yellow-600 disabled:opacity-70"
                >
                  {surveySubmitting ? 'Submitting…' : 'Submit evaluation'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )}

      {activityReminder && (
        <div
          className="fixed inset-0 z-70 flex h-screen items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-yellow-100 bg-white p-6 text-sm text-gray-800 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-500">Activity reminder</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 line-clamp-2">
                  {activityReminder.activityTitle}
                </h3>
                <p className="mt-0.5 text-[11px] text-gray-600 line-clamp-1">
                  Project: {activityReminder.projectName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivityReminder(null)}
                className="rounded-full border border-yellow-200 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-50"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-gray-700">{activityReminder.message}</p>
          </div>
        </div>
      )}
      {activitiesModalOpen && activitiesModalProject && (
        <div
          className="fixed inset-0 z-50 flex h-screen items-stretch bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="ml-auto flex h-screen w-full max-w-md flex-col bg-white text-sm text-gray-800 shadow-2xl"
            style={{
              transform: activitiesModalOpen ? 'translateX(0%)' : 'translateX(100%)',
              transition: 'transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1)',
            }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-yellow-100 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-500">Competencies / Topics</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 line-clamp-2">
                  {activitiesModalProject.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActivitiesModalOpen(false);
                  setActivitiesModalProject(null);
                  setActivitiesForModal([]);
                }}
                className="rounded-full border border-yellow-200 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-50"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {activitiesForModal.length === 0 ? (
                <p className="text-sm text-gray-600">
                  There are no competencies / topics listed yet for this project.
                </p>
              ) : (
                <ul className="space-y-2 text-sm text-gray-800">
                  {activitiesForModal.map((activity, index) => {
                  const joinedKey =
                    activitiesModalProject && activity.activityId !== null && activity.activityId !== undefined
                      ? `${activitiesModalProject._id}:${activity.activityId}`
                      : undefined;
                  const isJoined = !!(joinedKey && activityJoinStatusByKey[joinedKey] === 'joined');

                  const hasStart = !!activity.startAt;
                  const hasEnd = !!activity.endAt;

                  const now = nowMs;
                  const startDate = activity.startAt ? new Date(activity.startAt) : undefined;
                  const endDate = activity.endAt ? new Date(activity.endAt) : undefined;

                  const hasValidStart = !!startDate && !Number.isNaN(startDate.getTime());
                  const hasValidEnd = !!endDate && !Number.isNaN(endDate.getTime());

                  const isExpired = hasValidEnd && endDate!.getTime() < now;
                  const isOngoing =
                    hasValidStart && hasValidEnd && startDate!.getTime() <= now && now <= endDate!.getTime();
                  const isUpcoming = hasValidStart && !isOngoing && !isExpired && startDate!.getTime() > now;

                    return (
                      <li
                        key={`${activity.title}-${index}`}
                        onClick={() => {
                          setActivityDetailActivity(activity);
                          setActivityDetailIndex(index);
                          setActivityJoinError(null);
                          setActivityDetailOpen(true);
                        }}
                        className="cursor-pointer rounded-xl border border-yellow-100 bg-yellow-50/60 px-3 py-2 transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{activity.title}</p>
                          {activity.resourcePerson ? (
                           <p className="mt-0.5 text-xs text-gray-600">Resource person: {activity.resourcePerson}</p>
                          ) : null}

                          {(hasStart || hasEnd || (activity.location && activity.location.trim())) && (
                            <p className="mt-0.5 text-[11px] text-gray-600">
                              {hasStart && activity.startAt && (
                                <>
                                  Start:{' '}
                                  {new Date(activity.startAt).toLocaleString('en-PH', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })}
                                </>
                              )}
                              {activity.location && activity.location.trim() && (
                                <>
                                  {(hasStart || hasEnd) ? ' · ' : ''}
                                  Location: {activity.location.trim()}
                                </>
                              )}
                              {isExpired && ' · Ended'}
                            </p>
                          )}
                        </div>
                        {isJoined && (
                          <span className="mt-0.5 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            Joined
                          </span>
                        )}
                        {isUpcoming && (
                          <span className="mt-0.5 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                            Upcoming
                          </span>
                        )}
                        {isOngoing && (
                          <span className="mt-0.5 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                            Ongoing
                          </span>
                        )}
                        {isExpired && (
                          <span className="mt-0.5 inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                            Ended
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {activityDetailOpen && activityDetailActivity && activitiesModalProject && (
        <div
          className="fixed inset-0 z-60 flex h-screen items-center justify-center bg-black/50 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-yellow-100 bg-white p-6 text-sm text-gray-800 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-500">Activity details</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 line-clamp-2">
                  {activityDetailActivity.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActivityDetailOpen(false);
                  setActivityDetailActivity(null);
                  setActivityDetailIndex(null);
                  setActivityJoinError(null);
                }}
                className="rounded-full border border-yellow-200 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              {activityDetailActivity.resourcePerson ? (
                <p className="text-xs text-gray-600">
                  Resource person: <span className="font-medium">{activityDetailActivity.resourcePerson}</span>
                </p>
              ) : null}

              {(activityDetailActivity.startAt || activityDetailActivity.endAt || (activityDetailActivity.location && activityDetailActivity.location.trim())) && (
                <p className="text-[11px] text-gray-600">
                  {activityDetailActivity.startAt && (
                    <>
                      Start:{' '}
                      {new Date(activityDetailActivity.startAt).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </>
                  )}
                  {activityDetailActivity.endAt && (
                    <>
                      {activityDetailActivity.startAt ? ' · ' : ''}
                      End:{' '}
                      {new Date(activityDetailActivity.endAt).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </>
                  )}
                  {activityDetailActivity.location && activityDetailActivity.location.trim() && (
                    <>
                      {(activityDetailActivity.startAt || activityDetailActivity.endAt) ? ' · ' : ''}
                      Location: {activityDetailActivity.location.trim()}
                    </>
                  )}
                </p>
              )}

              {!activityDetailActivity.startAt && !activityDetailActivity.endAt && (
                <p className="text-xs text-gray-600">
                  This activity does not have a schedule yet. Please wait for the project leader to set the date and
                  time. You will be notified once it has been scheduled.
                </p>
              )}

              {activityDetailIsExpired && (activityDetailActivity.startAt || activityDetailActivity.endAt) && (
                <p className="text-xs text-red-600">
                  This activity has already ended. You can no longer join this activity.
                </p>
              )}

              {activityJoinError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {activityJoinError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setActivityDetailOpen(false);
                    setActivityDetailActivity(null);
                    setActivityDetailIndex(null);
                    setActivityJoinError(null);
                  }}
                  className="rounded-full border border-yellow-200 px-3 py-1 font-semibold text-yellow-700 hover:bg-yellow-50"
                >
                  Not now
                </button>
                {activityDetailActivity.startAt || activityDetailActivity.endAt ? (
                  <button
                  type="button"
                  disabled={activityJoinLoading ||
                    !participantEmail ||
                    (activitiesModalProject &&
                      activityDetailIndex !== null &&
                      activityJoinStatusByKey[`${activitiesModalProject._id}:${activityDetailIndex}`] === 'joined') ||
                    activityDetailIsExpired}
                  onClick={async () => {
                    if (!participantEmail) {
                      setActivityJoinError('Your email could not be detected. Please sign out and log in again.');
                      return;
                    }
                    if (!activitiesModalProject || activityDetailIndex === null) {
                      setActivityJoinError('Activity information is missing. Please close and reopen this project.');
                      return;
                    }

                    const key = `${activitiesModalProject._id}:${activityDetailIndex}`;

                    try {
                      setActivityJoinLoading(true);
                      setActivityJoinError(null);

                      const res = await fetch(
                        `http://localhost:5000/api/projects/${activitiesModalProject._id}/activities/${activityDetailIndex}/join`,
                        {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ email: participantEmail }),
                        },
                      );

                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        throw new Error(data.message || 'Failed to join activity');
                      }

                      setActivityJoinStatusByKey((prev) => ({ ...prev, [key]: 'joined' }));
                    } catch (joinErr: any) {
                      setActivityJoinError(joinErr.message || 'Failed to join activity');
                    } finally {
                      setActivityJoinLoading(false);
                    }
                  }}
                  className="rounded-full bg-yellow-500 px-4 py-1.5 font-semibold text-white shadow hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {activitiesModalProject &&
                  activityDetailIndex !== null &&
                  activityJoinStatusByKey[`${activitiesModalProject._id}:${activityDetailIndex}`] === 'joined'
                    ? 'Joined activity'
                    : activityJoinLoading
                    ? 'Joining…'
                    : 'Join this activity'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-red-100 bg-red-50/80 p-6 text-sm text-red-700 shadow-sm">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && approvedProjects.length === 0 && (
        <div className="rounded-2xl border border-yellow-100 bg-white/60 p-6 text-sm text-gray-700 shadow-sm">
          <p className="text-gray-500">
            There are currently no approved projects available. Please check back later or watch this page for new
            announcements.
          </p>
        </div>
      )}

      {!loading && !error && approvedProjects.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {approvedProjects.map((project) => (
            <button
              key={project._id}
              type="button"
              onClick={() => {
                if (joinedStatusByProject[project._id] === 'joined') {
                  openActivitiesModal(project);
                } else {
                  setJoinModalProject(project);
                  setJoinError(null);
                  setJoinModalOpen(true);
                }
              }}
              className="flex h-full flex-col rounded-2xl border border-yellow-100 bg-white/70 p-4 text-left text-sm text-gray-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="line-clamp-2 text-base font-semibold text-gray-900">{project.name}</h3>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  Approved
                </span>
              </div>
              <p className="line-clamp-3 text-sm text-gray-600">{project.description}</p>
              <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-gray-500">
                <span>Project-based opportunity</span>
                <span className="rounded-full border border-yellow-100 bg-yellow-50 px-2 py-0.5 font-medium text-yellow-700">
                  {joinedStatusByProject[project._id] === 'joined'
                    ? 'Joined'
                    : joinStatusByProject[project._id] === 'pending'
                    ? 'Join request pending'
                    : 'Open for registration'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      {joinModalOpen && joinModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-yellow-100 bg-white p-6 text-sm text-gray-800 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-yellow-500">Join project</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 line-clamp-2">{joinModalProject.name}</h3>
              </div>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              You are about to send a request to join this extension project as a beneficiary. The project leader will be
              notified and may approve or decline your request.
            </p>
            {joinError && (
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{joinError}</p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setJoinModalOpen(false);
                  setJoinModalProject(null);
                }}
                className="rounded-full border border-yellow-200 px-3 py-1 font-semibold text-yellow-700 hover:bg-yellow-50"
              >
                Not now
              </button>
              <button
                type="button"
                disabled={joinLoading || !!joinStatusByProject[joinModalProject._id]}
                onClick={async () => {
                  if (!participantEmail) {
                    setJoinError('Your email could not be detected. Please sign out and log in again.');
                    return;
                  }
                  try {
                    setJoinLoading(true);
                    setJoinError(null);
                    const res = await fetch(`http://localhost:5000/api/projects/${joinModalProject._id}/join`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ email: participantEmail }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.message || 'Failed to send join request');
                    }
                    setJoinStatusByProject((prev) => ({ ...prev, [joinModalProject._id]: 'pending' }));
                    setJoinModalOpen(false);
                    setJoinModalProject(null);
                  } catch (joinErr: any) {
                    setJoinError(joinErr.message || 'Failed to send join request');
                  } finally {
                    setJoinLoading(false);
                  }
                }}
                className="rounded-full bg-yellow-500 px-4 py-1.5 font-semibold text-white shadow hover:bg-yellow-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {joinStatusByProject[joinModalProject._id] === 'pending'
                  ? 'Request sent'
                  : joinLoading
                  ? 'Sending…'
                  : 'Join project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
