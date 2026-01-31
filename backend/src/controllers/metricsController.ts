import { Request, Response } from 'express';
import Project from '../models/Project';
import User from '../models/User';
import Notification from '../models/Notification';
import { getOnlineUserIds } from '../socket';

function startOfUTCDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function getLeaderStats(req: Request, res: Response) {
  try {
    const { leaderId, leaderEmail } = req.query as { leaderId?: string; leaderEmail?: string };
    const days = Math.max(1, Math.min(90, Number(req.query.days) || 14));

    const todayUTC = startOfUTCDay(new Date());
    const since = addDaysUTC(todayUTC, -days + 1);

    let projectFilter: Record<string, any> = {};
    if (leaderId && leaderId.trim()) {
      projectFilter.projectLeader = leaderId.trim();
    }

    const [leaderProjects] = await Promise.all([
      Project.find(projectFilter).select({ _id: 1, createdAt: 1 }).lean(),
    ]);

    const projectIds = leaderProjects.map((p) => p._id);

    // Helper to timeline fill
    const dates: string[] = [];
    const keyFor = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    for (let i = 0; i < days; i++) {
      const d = addDaysUTC(since, i);
      dates.push(d.toISOString().slice(0, 10));
    }

    // Projects daily created by leader
    const projectsDailyMap = new Map<string, number>();
    for (const p of leaderProjects) {
      const created = p as any;
      const ts: Date | undefined = created.createdAt;
      if (!ts || ts < since) continue;
      const key = keyFor(ts);
      projectsDailyMap.set(key, (projectsDailyMap.get(key) || 0) + 1);
    }

    // Notifications filtered for leader: either by projectId or by recipientEmail
    const notifOr: any[] = [];
    if (projectIds.length) notifOr.push({ project: { $in: projectIds } });
    if (leaderEmail && leaderEmail.trim()) notifOr.push({ recipientEmail: leaderEmail.trim() });

    let notifications: Array<{ title: string; createdAt: Date }> = [];
    if (notifOr.length) {
      notifications = await Notification.find({
        $or: notifOr,
        createdAt: { $gte: since },
      })
        .select({ title: 1, createdAt: 1 })
        .lean();
    }

    const requestsDailyMap = new Map<string, number>();
    const joinsDailyMap = new Map<string, number>();
    for (const n of notifications) {
      const key = keyFor(n.createdAt);
      if (n.title === 'Join request') {
        requestsDailyMap.set(key, (requestsDailyMap.get(key) || 0) + 1);
      } else if (n.title === 'Activity join') {
        joinsDailyMap.set(key, (joinsDailyMap.get(key) || 0) + 1);
      }
    }

    const projectsDaily: number[] = [];
    const requestsDaily: number[] = [];
    const joinsDaily: number[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDaysUTC(since, i);
      const key = keyFor(d);
      projectsDaily.push(projectsDailyMap.get(key) || 0);
      requestsDaily.push(requestsDailyMap.get(key) || 0);
      joinsDaily.push(joinsDailyMap.get(key) || 0);
    }

    return res.json({
      series: { dates, projectsDaily, requestsDaily, joinsDaily },
      projectCount: leaderProjects.length,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err?.message || 'Failed to compute leader metrics' });
  }
}

function addDaysUTC(d: Date, days: number) {
  const nd = new Date(d);
  nd.setUTCDate(nd.getUTCDate() + days);
  return nd;
}

async function aggregateDailyCounts(model: any, match: any, dateField: string, since: Date) {
  // Aggregate counts per UTC day since the given date
  const pipeline = [
    { $match: { ...match, [dateField]: { $gte: since } } },
    {
      $group: {
        _id: {
          y: { $year: { date: `$${dateField}`, timezone: 'UTC' } },
          m: { $month: { date: `$${dateField}`, timezone: 'UTC' } },
          d: { $dayOfMonth: { date: `$${dateField}`, timezone: 'UTC' } },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
  ];
  const rows = await model.aggregate(pipeline);
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = `${r._id.y}-${r._id.m}-${r._id.d}`;
    map.set(key, r.count);
  }
  return map;
}

export async function getAdminStats(req: Request, res: Response) {
  try {
    const days = Math.max(1, Math.min(90, Number(req.query.days) || 14));
    const todayUTC = startOfUTCDay(new Date());
    const since = addDaysUTC(todayUTC, -days + 1);

    const [totalProjects, pendingProjects, totalUsers] = await Promise.all([
      Project.countDocuments({}),
      Project.countDocuments({ status: 'Pending' }),
      User.countDocuments({}),
    ]);

    const [projectsDailyMap, usersDailyMap, pendingDailyMap] = await Promise.all([
      aggregateDailyCounts(Project, {}, 'createdAt', since),
      aggregateDailyCounts(User, {}, 'createdAt', since),
      aggregateDailyCounts(Project, { status: 'Pending' }, 'createdAt', since),
    ]);

    const dates: string[] = [];
    const projectsDaily: number[] = [];
    const usersDaily: number[] = [];
    const pendingDaily: number[] = [];

    for (let i = 0; i < days; i++) {
      const d = addDaysUTC(since, i);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      dates.push(d.toISOString().slice(0, 10));
      projectsDaily.push(projectsDailyMap.get(key) || 0);
      usersDaily.push(usersDailyMap.get(key) || 0);
      pendingDaily.push(pendingDailyMap.get(key) || 0);
    }

    const onlineNow = getOnlineUserIds().length;

    res.json({
      totals: { totalProjects, pendingProjects, totalUsers, onlineNow },
      series: { dates, projectsDaily, usersDaily, pendingDaily },
    });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || 'Failed to compute metrics' });
  }
}
