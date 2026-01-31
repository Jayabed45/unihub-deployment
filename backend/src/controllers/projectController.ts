import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import Project, { IProject, IProjectExtensionActivity } from '../models/Project';
import Notification from '../models/Notification';
import User from '../models/User';
import Role from '../models/Role';
import ActivityRegistration from '../models/ActivityRegistration';
import ProjectBeneficiary from '../models/ProjectBeneficiary';
import ActivityEvaluation from '../models/ActivityEvaluation';
import { getIO } from '../socket';
import { sendMail } from '../utils/mailer';
import { generateEmailHtml } from '../services/email.service';

const getAdminEmails = async (): Promise<string[]> => {
  try {
    const adminRole = await Role.findOne({ name: 'Administrator' }).lean();
    if (!adminRole) return [];

    const admins = await User.find({ role: adminRole._id }).lean();
    return admins
      .map((u) => u.email)
      .filter((email): email is string => typeof email === 'string' && !!email.trim());
  } catch (error) {
    console.error('Failed to lookup administrator emails for notifications', error);
    return [];
  }
};

export const updateExtensionActivities = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const rawActivities = (req.body as { activities?: any }).activities;

    if (!id) {
      return res.status(400).json({ message: 'Project id is required' });
    }

    if (!Array.isArray(rawActivities)) {
      return res.status(400).json({ message: 'activities must be an array' });
    }

    const sanitized: IProjectExtensionActivity[] = [];

    rawActivities.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        return;
      }

      const topicRaw = typeof item.topic === 'string' ? item.topic.trim() : '';
      const resourceRaw = typeof item.resourcePerson === 'string' ? item.resourcePerson.trim() : '';
      const hoursRaw = item.hours;

      if (!topicRaw && !resourceRaw && (hoursRaw === undefined || hoursRaw === null || hoursRaw === '')) {
        return;
      }

      if (!topicRaw) {
        return;
      }

      let hoursValue: number | undefined;
      if (typeof hoursRaw === 'number') {
        if (Number.isFinite(hoursRaw) && hoursRaw >= 0) {
          hoursValue = hoursRaw;
        }
      } else if (typeof hoursRaw === 'string') {
        const parsed = Number.parseFloat(hoursRaw.trim());
        if (Number.isFinite(parsed) && parsed >= 0) {
          hoursValue = parsed;
        }
      }

      sanitized.push({
        topic: topicRaw,
        hours: hoursValue,
        resourcePerson: resourceRaw || undefined,
      });
    });

    const project = await Project.findByIdAndUpdate(
      id,
      {
        $set: {
          extensionActivities: sanitized,
        },
      },
      { new: true },
    ).lean<IProject | null>();

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.json({
      projectId: project._id.toString(),
      activities: (project.extensionActivities || []).map((item) => ({
        topic: item.topic,
        hours: item.hours ?? null,
        resourcePerson: item.resourcePerson ?? '',
      })),
    });
  } catch (error) {
    console.error('Error updating extension activities', error);
    return res.status(500).json({ message: 'Failed to update extension activities' });
  }
};

const getProjectLeaderEmail = async (projectLeaderId: any): Promise<string | undefined> => {
  if (!projectLeaderId) return undefined;
  try {
    const leader = await User.findById(projectLeaderId).lean();
    return leader?.email;
  } catch (error) {
    console.error('Failed to lookup project leader email for notifications', error);
    return undefined;
  }
};

export const createProject = async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      projectLeaderId,
      sections,
      totals,
    }: {
      name?: string;
      description?: string;
      projectLeaderId?: string;
      sections?: Record<string, any>;
      totals?: Record<string, any>;
    } = req.body || {};

    if (!projectLeaderId) {
      return res.status(400).json({ message: 'projectLeaderId is required' });
    }

    const project = new Project({
      name: name && name.trim() ? name.trim() : 'Untitled Project',
      description: description && description.trim() ? description.trim() : 'Extension project proposal',
      projectLeader: projectLeaderId,
      activities: [],
      proposalData: sections || {},
      summary: totals || {},
      status: 'Pending',
    } as any);

    const saved = await project.save();

    let leaderEmail: string | undefined;
    try {
      const leader = await User.findById(projectLeaderId).lean();
      leaderEmail = leader?.email;
    } catch (lookupError) {
      console.error('Failed to lookup project leader for notification', lookupError);
    }

    const createdNotification = await Notification.create({
      title: 'New project created',
      message: leaderEmail ? `${leaderEmail} created new project` : `${saved.name} created new project`,
      project: saved._id,
    });

    try {
      const io = getIO();
      io.emit('notification:new', {
        id: createdNotification._id.toString(),
        title: createdNotification.title,
        message: createdNotification.message,
        projectId: saved._id.toString(),
        timestamp: createdNotification.createdAt
          ? createdNotification.createdAt.toLocaleString('en-PH', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '',
        read: createdNotification.read,
      });
    } catch (socketError) {
      console.error('Failed to emit new project notification over socket', socketError);
    }

    // Best-effort admin email: new project submitted
    try {
      const adminEmails = await getAdminEmails();
      if (adminEmails.length > 0) {
        await Promise.all(
          adminEmails.map((addr) =>
            sendMail({
              to: addr,
              subject: `New project submitted: ${saved.name}`,
              text: `Hello Admin,\n\nA new project "${saved.name}" has been submitted by ${
                leaderEmail ?? 'a project leader'
              }.\n\nPlease review it in the UniHub admin dashboard.\n\n– UniHub System`,
            }),
          ),
        );
      }
    } catch (emailError) {
      console.error('Failed to send new project submission emails to admins', emailError);
    }

    return res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating project proposal', error);
    return res.status(500).json({ message: 'Failed to create project proposal' });
  }
};

export const updateActivitySchedule = async (req: Request, res: Response) => {
  try {
    const { id, activityId } = req.params;
    const { startAt, endAt, location } = req.body as {
      startAt?: string | null;
      endAt?: string | null;
      location?: string | null;
    };

    const rawActivityId = Array.isArray(activityId) ? activityId[0] : activityId;
    const numericActivityId = Number.parseInt(rawActivityId, 10);
    if (!Number.isFinite(numericActivityId) || numericActivityId < 0) {
      return res.status(400).json({ message: 'Invalid activityId' });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    let parsedStart: Date | undefined;
    let parsedEnd: Date | undefined;
    let locationValue: string | undefined;

    if (startAt) {
      const d = new Date(startAt);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ message: 'Invalid startAt value' });
      }
      parsedStart = d;
    }

    if (endAt) {
      const d = new Date(endAt);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ message: 'Invalid endAt value' });
      }
      parsedEnd = d;
    }

    if (typeof location === 'string') {
      const trimmed = location.trim();
      if (trimmed) {
        locationValue = trimmed;
      }
    }

    const schedule = Array.isArray((project as any).activitySchedule)
      ? [...((project as any).activitySchedule as any[])]
      : [];

    const idx = schedule.findIndex((item) => Number(item.activityId) === numericActivityId);

    const hasAnyField = typeof parsedStart !== 'undefined' || typeof parsedEnd !== 'undefined' || typeof locationValue !== 'undefined';

    if (!hasAnyField) {
      if (idx !== -1) {
        schedule.splice(idx, 1);
      }
    } else if (idx === -1) {
      schedule.push({ activityId: numericActivityId, startAt: parsedStart, endAt: parsedEnd, location: locationValue });
    } else {
      const current = schedule[idx] || {};
      schedule[idx] = {
        activityId: numericActivityId,
        startAt: typeof parsedStart !== 'undefined' ? parsedStart : current.startAt,
        endAt: typeof parsedEnd !== 'undefined' ? parsedEnd : current.endAt,
        location: typeof locationValue !== 'undefined' ? locationValue : (current as any).location,
      };
    }

    // Sanitize schedule before saving: drop any invalid entries and normalize activityId to a number
    const cleanedSchedule = schedule
      .filter((item) => {
        if (!item) return false;
        const id = Number((item as any).activityId);
        return Number.isFinite(id) && id >= 0;
      })
      .map((item) => {
        const id = Number((item as any).activityId);
        return {
          activityId: id,
          // Preserve existing dates if present
          startAt: (item as any).startAt,
          endAt: (item as any).endAt,
          location: (item as any).location,
        };
      });

    (project as any).activitySchedule = cleanedSchedule;

    const saved = await project.save();

    const updatedEntry = (saved as any).activitySchedule?.find(
      (item: any) => Number(item.activityId) === numericActivityId,
    );

    // Notify registered participants about the updated schedule (socket + email)
    try {
      const registrations = await ActivityRegistration.find({
        project: saved._id,
        activityId: numericActivityId,
      })
        .select({ participantEmail: 1 })
        .lean();

      if (registrations.length > 0) {
        // Derive activity title from training-design snapshot, same logic as listParticipantActivities
        let activityTitle = `Activity ${numericActivityId + 1}`;
        try {
          const proposal: any = (saved as any).proposalData;
          const trainingSnapshot = proposal && proposal['training-design'];

          if (trainingSnapshot && Array.isArray(trainingSnapshot.editableCells)) {
            const cells: string[] = trainingSnapshot.editableCells;
            let indexCounter = 0;

            for (let i = 0; i + 1 < cells.length; i += 2) {
              const title = (cells[i] || '').trim();
              if (!title) continue;

              if (indexCounter === numericActivityId) {
                activityTitle = title;
                break;
              }

              indexCounter += 1;
            }
          }
        } catch (parseError) {
          console.error('Failed to derive activity title for updateActivitySchedule notifications', parseError);
        }

        const projectName = (saved as any).name || 'Untitled project';
        const startLabel = updatedEntry?.startAt
          ? new Date(updatedEntry.startAt).toLocaleString('en-PH', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '';
        const endLabel = updatedEntry?.endAt
          ? new Date(updatedEntry.endAt).toLocaleString('en-PH', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '';
        const locationLabel = updatedEntry?.location || '';

        const io = getIO();

        for (const reg of registrations) {
          const recipientEmail = reg.participantEmail;
          if (!recipientEmail) continue;

          const lines: string[] = [];
          if (startLabel) lines.push(`Start: ${startLabel}`);
          if (endLabel) lines.push(`End: ${endLabel}`);
          if (locationLabel) lines.push(`Location: ${locationLabel}`);

          const details = lines.length > 0 ? ` (${lines.join(' · ')})` : '';

          const notif = await Notification.create({
            title: 'Activity schedule updated',
            message: `[${projectName}] ${activityTitle}${details}`,
            project: saved._id,
            recipientEmail,
          });

          try {
            io.emit('notification:new', {
              id: notif._id.toString(),
              title: notif.title,
              message: notif.message,
              projectId: saved._id.toString(),
              recipientEmail: notif.recipientEmail,
              timestamp: notif.createdAt
                ? notif.createdAt.toLocaleString('en-PH', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : '',
              read: notif.read,
            });
          } catch (socketError) {
            console.error('Failed to emit activity schedule update notification over socket', socketError);
          }

          try {
            const userDoc = await User.findOne({ email: recipientEmail }).lean();
            const { subject, html } = generateEmailHtml({
              notification: notif,
              project: saved as any,
              user: userDoc || null,
            });

            await sendMail({
              to: recipientEmail,
              subject,
              html,
              text: notif.message,
            });
          } catch (emailError) {
            console.error('Failed to send activity schedule update email', emailError);
          }
        }
      }
    } catch (notifyError) {
      console.error('Failed to fan out activity schedule update notifications', notifyError);
    }

    return res.json({
      activityId: numericActivityId,
      startAt: updatedEntry?.startAt ?? null,
      endAt: updatedEntry?.endAt ?? null,
      location: updatedEntry?.location ?? null,
    });
  } catch (error) {
    console.error('Error updating activity schedule', error);
    return res.status(500).json({ message: 'Failed to update activity schedule' });
  }
};

export const listProjects = async (req: Request, res: Response) => {
  try {
    const { projectLeaderId } = req.query as { projectLeaderId?: string };

    const filter: Record<string, any> = {};
    if (projectLeaderId) {
      filter.projectLeader = projectLeaderId;
    }

    const projects = await Project.find(filter).sort({ _id: -1 }).lean();
    return res.json(projects);
  } catch (error) {
    console.error('Error listing projects', error);
    return res.status(500).json({ message: 'Failed to fetch projects' });
  }
};

export const getProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }
    return res.json(project);
  } catch (error) {
    console.error('Error fetching project', error);
    return res.status(500).json({ message: 'Failed to fetch project' });
  }
};

export const evaluateProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, evaluation } = req.body as {
      status?: 'Pending' | 'Approved' | 'Rejected';
      evaluation?: any;
    };

    if (!status && !evaluation) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    if (status && !['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const update: Record<string, any> = {};
    if (typeof evaluation !== 'undefined') {
      update.evaluation = evaluation;
    }
    if (status) {
      update.status = status;
    }

    const project = await Project.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (status === 'Approved') {
      try {
        const approvalNotification = await Notification.create({
          title: 'Project approved',
          message: 'Admin approved your project',
          project: project._id,
        });

        try {
          const io = getIO();
          io.emit('notification:new', {
            id: approvalNotification._id.toString(),
            title: approvalNotification.title,
            message: approvalNotification.message,
            projectId: project._id.toString(),
            timestamp: approvalNotification.createdAt
              ? approvalNotification.createdAt.toLocaleString('en-PH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : '',
            read: approvalNotification.read,
          });
        } catch (socketError) {
          console.error('Failed to emit approval notification over socket', socketError);
        }

        try {
          const leaderEmail = await getProjectLeaderEmail(project.projectLeader);
          if (leaderEmail) {
            await sendMail({
              to: leaderEmail,
              subject: `Your project "${project.name}" has been approved`,
              text: `Hi,\n\nYour project "${project.name}" has been approved by the UniHub administrators.\n\nYou can now publish activities and accept participants.\n\n– UniHub Team`,
            });
          }
        } catch (emailError) {
          console.error('Failed to send project approval email to project leader', emailError);
        }
      } catch (notifyError) {
        console.error('Failed to create approval notification', notifyError);
      }
    }

    return res.json(project);
  } catch (error) {
    console.error('Error evaluating project', error);
    return res.status(500).json({ message: 'Failed to evaluate project' });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await Project.findByIdAndDelete(id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting project', error);
    return res.status(500).json({ message: 'Failed to delete project' });
  }
};

export const requestJoinProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email } = req.body as { email?: string };

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required to request to join a project' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const createdNotification = await Notification.create({
      title: 'Join request',
      message: `${email} wants to join`,
      project: project._id,
    });

    try {
      const io = getIO();
      io.emit('notification:new', {
        id: createdNotification._id.toString(),
        title: createdNotification.title,
        message: createdNotification.message,
        projectId: project._id.toString(),
        timestamp: createdNotification.createdAt
          ? createdNotification.createdAt.toLocaleString('en-PH', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '',
        read: createdNotification.read,
      });
    } catch (socketError) {
      console.error('Failed to emit join request notification over socket', socketError);
    }

    try {
      const [adminEmails, leaderEmail] = await Promise.all([
        getAdminEmails(),
        getProjectLeaderEmail(project.projectLeader),
      ]);

      await Promise.all([
        // Admin emails
        ...adminEmails.map((addr) =>
          sendMail({
            to: addr,
            subject: `New project join request: ${project.name}`,
            text: `Hello Admin,\n\n${email} has requested to join the project "${project.name}".\n\nYou can review this project in the UniHub admin dashboard.\n\n– UniHub System`,
          }),
        ),
        // Project leader email
        ...(leaderEmail
          ? [
              sendMail({
                to: leaderEmail,
                subject: `New join request for "${project.name}"`,
                text: `Hi,\n\n${email} has requested to join your project "${project.name}".\n\nYou can review and respond to this request in your UniHub Project Leader dashboard.\n\n– UniHub Team`,
              }),
            ]
          : []),
      ]);
    } catch (emailError) {
      console.error('Failed to send join request email notifications', emailError);
    }

    return res.status(201).json({ message: 'Join request sent' });
  } catch (error) {
    console.error('Error requesting to join project', error);
    return res.status(500).json({ message: 'Failed to request to join project' });
  }
};

export const respondToJoinRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, decision } = req.body as { email?: string; decision?: string };

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required to respond to a join request' });
    }

    const normalizedDecision =
      decision === 'approved' || decision === 'declined' ? (decision as 'approved' | 'declined') : undefined;

    if (!normalizedDecision) {
      return res.status(400).json({ message: 'Decision must be either "approved" or "declined"' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Mark matching join-request notifications as read so they no longer show as pending on leader side
    try {
      await Notification.updateMany(
        {
          title: 'Join request',
          project: project._id,
          message: `${email} wants to join`,
        },
        { $set: { read: true } },
      );
    } catch (markError) {
      console.error('Failed to mark join request notifications as read', markError);
    }

    let title: string;
    let message: string;

    if (normalizedDecision === 'approved') {
      title = 'Join request approved';
      message = `${email} - Your request to join "${project.name}" was approved.`;

      try {
        await ProjectBeneficiary.findOneAndUpdate(
          { project: project._id, email },
          { $set: { status: 'active' } },
          { upsert: true, new: true },
        ).lean();
      } catch (beneficiaryError) {
        console.error('Failed to upsert project beneficiary on approval', beneficiaryError);
      }
    } else {
      title = 'Join request declined';
      message = `${email} - Your request to join "${project.name}" was declined.`;
    }

    const createdNotification = await Notification.create({
      title,
      message,
      project: project._id,
      recipientEmail: email,
    });

    try {
      const io = getIO();
      io.emit('notification:new', {
        id: createdNotification._id.toString(),
        title: createdNotification.title,
        message: createdNotification.message,
        projectId: project._id.toString(),
        timestamp: createdNotification.createdAt
          ? createdNotification.createdAt.toLocaleString('en-PH', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '',
        read: createdNotification.read,
      });
    } catch (socketError) {
      console.error('Failed to emit join request response notification over socket', socketError);
    }

    if (createdNotification.recipientEmail) {
      try {
        const subject =
          normalizedDecision === 'approved'
            ? `You’ve been accepted to "${project.name}" on UniHub`
            : `Update on your request for "${project.name}"`;

        const text =
          normalizedDecision === 'approved'
            ? `Hi,\n\nGood news! Your request to join "${project.name}" has been approved.\n\nYou can now view project details and upcoming activities in UniHub.\n\n– UniHub Team`
            : `Hi,\n\nYour request to join "${project.name}" was not approved at this time.\n\nYou can explore other projects and activities in UniHub anytime.\n\n– UniHub Team`;

        await sendMail({
          to: createdNotification.recipientEmail,
          subject,
          text,
        });
      } catch (emailError) {
        console.error('Failed to send join request response email', emailError);
      }
    }

    return res.json({
      message:
        normalizedDecision === 'approved'
          ? 'Join request approved and participant notified'
          : 'Join request declined and participant notified',
    });
  } catch (error) {
    console.error('Error responding to join request', error);
    return res.status(500).json({ message: 'Failed to respond to join request' });
  }
};

export const joinActivity = async (req: Request, res: Response) => {
  try {
    const { id, activityId } = req.params;
    const { email } = req.body as { email?: string };

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required to join an activity' });
    }

    const rawActivityId = Array.isArray(activityId) ? activityId[0] : activityId;
    const numericActivityId = Number.parseInt(rawActivityId, 10);
    if (!Number.isFinite(numericActivityId) || numericActivityId < 0) {
      return res.status(400).json({ message: 'Invalid activityId' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Do not allow joining if the activity has no schedule yet or has already ended
    try {
      const scheduleList: Array<{ activityId: number; startAt?: Date; endAt?: Date }> = Array.isArray(
        (project as any).activitySchedule,
      )
        ? (((project as any).activitySchedule as any[]) || []).map((item) => ({
            activityId: Number((item as any).activityId),
            startAt: (item as any).startAt as Date | undefined,
            endAt: (item as any).endAt as Date | undefined,
          }))
        : [];

      const scheduleEntry = scheduleList.find((item) => item.activityId === numericActivityId);
      if (!scheduleEntry || (!scheduleEntry.startAt && !scheduleEntry.endAt)) {
        return res.status(400).json({
          message:
            'This activity is not yet scheduled. Please wait for the project leader to set the date and time.',
        });
      }

      if (scheduleEntry.endAt) {
        const endDate = new Date(scheduleEntry.endAt);
        if (!Number.isNaN(endDate.getTime()) && endDate.getTime() < Date.now()) {
          return res.status(400).json({
            message: 'This activity has already ended. You can no longer join this activity.',
          });
        }
      }
    } catch (scheduleError) {
      console.error('Failed to validate activity schedule for joinActivity', scheduleError);
    }

    let activityTitle = `Activity ${numericActivityId + 1}`;

    try {
      const proposal: any = (project as any).proposalData;
      const trainingSnapshot = proposal && proposal['training-design'];

      if (trainingSnapshot && Array.isArray(trainingSnapshot.editableCells)) {
        const cells: string[] = trainingSnapshot.editableCells;
        let indexCounter = 0;

        for (let i = 0; i + 1 < cells.length; i += 2) {
          const title = (cells[i] || '').trim();
          const resourcePerson = (cells[i + 1] || '').trim();

          if (!title) {
            continue;
          }

          if (indexCounter === numericActivityId) {
            activityTitle = title;
            break;
          }

          indexCounter += 1;
        }
      }
    } catch (parseError) {
      console.error('Failed to derive activity title for joinActivity', parseError);
    }

    try {
      const existing = await ActivityRegistration.findOne({
        project: project._id,
        activityId: numericActivityId,
        participantEmail: email,
      }).lean();

      if (existing) {
        return res.status(409).json({ message: 'You are already registered for this activity' });
      }

      await ActivityRegistration.create({
        project: project._id,
        activityId: numericActivityId,
        participantEmail: email,
        status: 'registered',
      });
    } catch (regError) {
      console.error('Failed to register participant for activity', regError);
      return res.status(500).json({ message: 'Failed to join activity' });
    }

    try {
      const createdNotification = await Notification.create({
        title: 'Activity join',
        message: `${email} joined activity "${activityTitle}" of project "${project.name}"`,
        project: project._id,
      });

      try {
        const io = getIO();
        io.emit('notification:new', {
          id: createdNotification._id.toString(),
          title: createdNotification.title,
          message: createdNotification.message,
          projectId: project._id.toString(),
          timestamp: createdNotification.createdAt
            ? createdNotification.createdAt.toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            : '',
          read: createdNotification.read,
        });
      } catch (socketError) {
        console.error('Failed to emit activity join notification over socket', socketError);
      }

      try {
        const leaderEmail = await getProjectLeaderEmail(project.projectLeader);
        if (leaderEmail) {
          await sendMail({
            to: leaderEmail,
            subject: `New participant joined "${activityTitle}"`,
            text: `Hi,\n\n${email} has joined your activity "${activityTitle}" in project "${project.name}".\n\nYou can see all participants and manage attendance from your UniHub projects page.\n\n– UniHub Team`,
          });
        }
      } catch (emailError) {
        console.error('Failed to send activity join email to project leader', emailError);
      }
    } catch (notifyError) {
      console.error('Failed to create activity join notification', notifyError);
    }

    return res.status(201).json({ message: 'Joined activity' });
  } catch (error) {
    console.error('Error joining activity', error);
    return res.status(500).json({ message: 'Failed to join activity' });
  }
};

export const listActivityRegistrations = async (req: Request, res: Response) => {
  try {
    const { id, activityId } = req.params;
    const rawActivityId = Array.isArray(activityId) ? activityId[0] : activityId;
    const numericActivityId = Number.parseInt(rawActivityId, 10);

    if (!Number.isFinite(numericActivityId) || numericActivityId < 0) {
      return res.status(400).json({ message: 'Invalid activityId' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const registrations = await ActivityRegistration.find({
      project: project._id,
      activityId: numericActivityId,
    })
      .sort({ createdAt: 1 })
      .lean();

    const mapped = registrations.map((reg) => ({
      participantEmail: reg.participantEmail,
      status: reg.status,
      updatedAt: reg.updatedAt,
    }));

    return res.json(mapped);
  } catch (error) {
    console.error('Error listing activity registrations', error);
    return res.status(500).json({ message: 'Failed to load activity registrations' });
  }
};

export const updateActivityRegistration = async (req: Request, res: Response) => {
  try {
    const { id, activityId } = req.params;
    const { email, status } = req.body as { email?: string; status?: string };

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required to update activity registration' });
    }

    const allowedStatuses: Array<'present' | 'absent'> = ['present', 'absent'];
    if (!status || !allowedStatuses.includes(status as 'present' | 'absent')) {
      return res.status(400).json({ message: 'Status must be either "present" or "absent"' });
    }

    const rawActivityId = Array.isArray(activityId) ? activityId[0] : activityId;
    const numericActivityId = Number.parseInt(rawActivityId, 10);
    if (!Number.isFinite(numericActivityId) || numericActivityId < 0) {
      return res.status(400).json({ message: 'Invalid activityId' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const updated = await ActivityRegistration.findOneAndUpdate(
      {
        project: project._id,
        activityId: numericActivityId,
        participantEmail: email,
      },
      {
        $set: { status },
        $setOnInsert: { participantEmail: email },
      },
      { new: true, upsert: true },
    ).lean();

    if (!updated) {
      return res.status(500).json({ message: 'Failed to update activity registration' });
    }

    // Create a notification so participants can be informed in real time
    try {
      let activityTitle = `Activity ${numericActivityId + 1}`;

      try {
        const proposal: any = (project as any).proposalData;
        const trainingSnapshot = proposal && proposal['training-design'];

        if (trainingSnapshot && Array.isArray(trainingSnapshot.editableCells)) {
          const cells: string[] = trainingSnapshot.editableCells;
          let indexCounter = 0;

          for (let i = 0; i + 1 < cells.length; i += 2) {
            const title = (cells[i] || '').trim();
            const resourcePerson = (cells[i + 1] || '').trim();

            if (!title) {
              continue;
            }

            if (indexCounter === numericActivityId) {
              activityTitle = title;
              break;
            }

            indexCounter += 1;
          }
        }
      } catch (parseError) {
        console.error('Failed to derive activity title for updateActivityRegistration', parseError);
      }

      const title = 'Activity attendance updated';
      const message = `${updated.participantEmail} - Your attendance for activity "${activityTitle}" in project "${project.name}" was marked as ${updated.status}.`;

      const createdNotification = await Notification.create({
        title,
        message,
        project: project._id,
        recipientEmail: updated.participantEmail,
      });

      try {
        const io = getIO();
        io.emit('notification:new', {
          id: createdNotification._id.toString(),
          title: createdNotification.title,
          message: createdNotification.message,
          projectId: project._id.toString(),
          timestamp: createdNotification.createdAt
            ? createdNotification.createdAt.toLocaleString('en-PH', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            : '',
          read: createdNotification.read,
        });
      } catch (socketError) {
        console.error('Failed to emit activity attendance notification over socket', socketError);
      }

      if (updated.participantEmail) {
        await sendMail({
          to: updated.participantEmail,
          subject: `Your attendance for "${activityTitle}" was marked as ${updated.status}`,
          text: `Hi,\n\nYour attendance for the activity "${activityTitle}" in project "${project.name}" was marked as ${updated.status}.\n\nIf you have any questions, please contact the project leader.\n\n– UniHub Team`,
        });
      }
    } catch (notifyError) {
      console.error('Failed to create activity attendance notification', notifyError);
    }

    return res.json({
      participantEmail: updated.participantEmail,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Error updating activity registration', error);
    return res.status(500).json({ message: 'Failed to update activity registration' });
  }
};

export const deleteActivityRegistration = async (req: Request, res: Response) => {
  try {
    const { id, activityId } = req.params;
    const { email } = req.body as { email?: string };

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required to delete activity registration' });
    }

    const rawActivityId = Array.isArray(activityId) ? activityId[0] : activityId;
    const numericActivityId = Number.parseInt(rawActivityId, 10);
    if (!Number.isFinite(numericActivityId) || numericActivityId < 0) {
      return res.status(400).json({ message: 'Invalid activityId' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const deleted = await ActivityRegistration.findOneAndDelete({
      project: project._id,
      activityId: numericActivityId,
      participantEmail: email,
    }).lean();

    if (!deleted) {
      return res.status(404).json({ message: 'Activity registration not found' });
    }

    return res.json({ message: 'Activity registration removed' });
  } catch (error) {
    console.error('Error deleting activity registration', error);
    return res.status(500).json({ message: 'Failed to delete activity registration' });
  }
};

export const listParticipantActivities = async (req: Request, res: Response) => {
  try {
    const rawEmail = (req.query.email as string | string[] | undefined) ?? '';
    const email = Array.isArray(rawEmail) ? rawEmail[0]?.trim() : rawEmail.trim();

    if (!email) {
      return res.status(400).json({ message: 'Email query parameter is required' });
    }

    const registrations = await ActivityRegistration.find({ participantEmail: email })
      .sort({ updatedAt: -1 })
      .lean();

    if (registrations.length === 0) {
      return res.json([]);
    }

    const projectIds = Array.from(new Set(registrations.map((reg) => reg.project.toString())));

    const projects = await Project.find({ _id: { $in: projectIds } })
      .select({ name: 1, proposalData: 1, activitySchedule: 1 })
      .lean();

    const projectMap = new Map<string, any>();
    for (const project of projects) {
      projectMap.set(project._id.toString(), project);
    }

    const result = registrations.map((reg) => {
      const projectId = reg.project.toString();
      const project = projectMap.get(projectId);

      let activityTitle = `Activity ${reg.activityId + 1}`;

      try {
        const proposal: any = project?.proposalData;
        const trainingSnapshot = proposal && proposal['training-design'];

        if (trainingSnapshot && Array.isArray(trainingSnapshot.editableCells)) {
          const cells: string[] = trainingSnapshot.editableCells;
          let indexCounter = 0;

          for (let i = 0; i + 1 < cells.length; i += 2) {
            const title = (cells[i] || '').trim();

            if (!title) {
              continue;
            }

            if (indexCounter === reg.activityId) {
              activityTitle = title;
              break;
            }

            indexCounter += 1;
          }
        }
      } catch (parseError) {
        console.error('Failed to derive activity title for listParticipantActivities', parseError);
      }

      let startAt: Date | null = null;
      let endAt: Date | null = null;
      let location: string | null = null;

      try {
        const scheduleList: Array<{ activityId: number; startAt?: Date; endAt?: Date; location?: string | null }> = Array.isArray(
          (project as any)?.activitySchedule,
        )
          ? (((project as any).activitySchedule as any[]) || []).map((item) => ({
              activityId: Number((item as any).activityId),
              startAt: (item as any).startAt as Date | undefined,
              endAt: (item as any).endAt as Date | undefined,
              location: typeof (item as any).location === 'string' ? ((item as any).location as string) : undefined,
            }))
          : [];

        const scheduleEntry = scheduleList.find((item) => item.activityId === reg.activityId);
        if (scheduleEntry) {
          startAt = scheduleEntry.startAt ?? null;
          endAt = scheduleEntry.endAt ?? null;
          location = typeof scheduleEntry.location === 'string' ? scheduleEntry.location : null;
        }
      } catch (scheduleError) {
        console.error('Failed to derive activity schedule for listParticipantActivities', scheduleError);
      }

      return {
        projectId,
        projectName: project?.name ?? 'Unknown project',
        activityId: reg.activityId,
        activityTitle,
        status: reg.status,
        updatedAt: reg.updatedAt ?? reg.createdAt,
        startAt,
        endAt,
        location,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error('Error listing participant activities', error);
    return res.status(500).json({ message: 'Failed to load participant activities' });
  }
};

export const listProjectSummaries = async (_req: Request, res: Response) => {
  try {
    const projects = await Project.find({})
      .select({ name: 1, activitySchedule: 1 })
      .lean();

    if (!projects.length) {
      return res.json([]);
    }

    const projectIds = projects.map((p) => p._id);

    const [beneficiaries, registrations] = await Promise.all([
      ProjectBeneficiary.find({ project: { $in: projectIds }, status: 'active' })
        .select({ project: 1 })
        .lean(),
      ActivityRegistration.find({ project: { $in: projectIds } })
        .select({ project: 1, activityId: 1, status: 1 })
        .lean(),
    ]);

    const activeBeneficiaryCountByProject = new Map<string, number>();
    beneficiaries.forEach((doc) => {
      const key = doc.project.toString();
      activeBeneficiaryCountByProject.set(key, (activeBeneficiaryCountByProject.get(key) || 0) + 1);
    });

    const regStatsByProject = new Map<
      string,
      { activityIdsFromRegs: Set<number>; present: number; absent: number; registered: number }
    >();

    registrations.forEach((reg) => {
      const key = reg.project.toString();
      let entry = regStatsByProject.get(key);
      if (!entry) {
        entry = {
          activityIdsFromRegs: new Set<number>(),
          present: 0,
          absent: 0,
          registered: 0,
        };
        regStatsByProject.set(key, entry);
      }

      const activityIdNum = Number((reg as any).activityId);
      if (Number.isFinite(activityIdNum)) {
        entry.activityIdsFromRegs.add(activityIdNum);
      }

      const status = (reg as any).status;
      if (status === 'present') {
        entry.present += 1;
      } else if (status === 'absent') {
        entry.absent += 1;
      } else if (status === 'registered') {
        entry.registered += 1;
      }
    });

    const summaries = projects.map((project) => {
      const key = project._id.toString();

      const scheduleActivityIds = new Set<number>();
      try {
        const scheduleList: Array<{ activityId: number }> = Array.isArray((project as any).activitySchedule)
          ? (((project as any).activitySchedule as any[]) || []).map((item) => ({
              activityId: Number((item as any).activityId),
            }))
          : [];

        scheduleList.forEach((item) => {
          if (Number.isFinite(item.activityId)) {
            scheduleActivityIds.add(item.activityId);
          }
        });
      } catch {
        // ignore schedule parsing errors, fall back to registrations
      }

      const regStats = regStatsByProject.get(key);
      const activityIdsFromRegs = regStats?.activityIdsFromRegs ?? new Set<number>();

      let totalActivities = scheduleActivityIds.size;
      if (totalActivities === 0 && activityIdsFromRegs.size > 0) {
        totalActivities = activityIdsFromRegs.size;
      }

      return {
        projectId: key,
        projectName: (project as any).name || 'Untitled project',
        totalBeneficiariesActive: activeBeneficiaryCountByProject.get(key) || 0,
        totalActivities,
        totalPresent: regStats?.present || 0,
        totalAbsent: regStats?.absent || 0,
        totalRegistered: regStats?.registered || 0,
      };
    });

    return res.json(summaries);
  } catch (error) {
    console.error('Error listing project summaries', error);
    return res.status(500).json({ message: 'Failed to load project summaries' });
  }
};

export const exportProjectSummaryWorkbook = async (_req: Request, res: Response) => {
  try {
    const projects = await Project.find({})
      .select({ name: 1, activitySchedule: 1 })
      .lean();

    const workbook = new ExcelJS.Workbook();

    const summarySheet = workbook.addWorksheet('Project_Summary');
    summarySheet.addRow([
      'Project Name',
      'Total Beneficiaries (Active)',
      'Total Activities',
      'Total Present (all activities)',
      'Total Absent (all activities)',
      'Total Registered (never marked)',
    ]);

    if (!projects.length) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="unihub-project-summary.xlsx"');
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    const projectIds = projects.map((p) => p._id);

    const [beneficiaries, registrations] = await Promise.all([
      ProjectBeneficiary.find({ project: { $in: projectIds } }).lean(),
      ActivityRegistration.find({ project: { $in: projectIds } }).lean(),
    ]);

    const projectById = new Map<string, any>();
    projects.forEach((p: any) => {
      projectById.set(p._id.toString(), p);
    });

    const activeBeneficiaryCountByProject = new Map<string, number>();
    (beneficiaries as any[]).forEach((doc) => {
      if (doc.status !== 'active') return;
      const key = doc.project.toString();
      activeBeneficiaryCountByProject.set(key, (activeBeneficiaryCountByProject.get(key) || 0) + 1);
    });

    const regStatsByProject = new Map<
      string,
      { activityIdsFromRegs: Set<number>; present: number; absent: number; registered: number }
    >();

    (registrations as any[]).forEach((reg) => {
      const key = reg.project.toString();
      let entry = regStatsByProject.get(key);
      if (!entry) {
        entry = {
          activityIdsFromRegs: new Set<number>(),
          present: 0,
          absent: 0,
          registered: 0,
        };
        regStatsByProject.set(key, entry);
      }

      const activityIdNum = Number(reg.activityId);
      if (Number.isFinite(activityIdNum)) {
        entry.activityIdsFromRegs.add(activityIdNum);
      }

      if (reg.status === 'present') {
        entry.present += 1;
      } else if (reg.status === 'absent') {
        entry.absent += 1;
      } else if (reg.status === 'registered') {
        entry.registered += 1;
      }
    });

    (projects as any[]).forEach((project) => {
      const key = project._id.toString();

      const scheduleActivityIds = new Set<number>();
      try {
        const scheduleList: Array<{ activityId: number }> = Array.isArray(project.activitySchedule)
          ? ((project.activitySchedule as any[]) || []).map((item) => ({
              activityId: Number((item as any).activityId),
            }))
          : [];

        scheduleList.forEach((item) => {
          if (Number.isFinite(item.activityId)) {
            scheduleActivityIds.add(item.activityId);
          }
        });
      } catch {
        // ignore schedule parsing errors, fall back to registrations
      }

      const regStats = regStatsByProject.get(key);
      const activityIdsFromRegs = regStats?.activityIdsFromRegs ?? new Set<number>();

      let totalActivities = scheduleActivityIds.size;
      if (totalActivities === 0 && activityIdsFromRegs.size > 0) {
        totalActivities = activityIdsFromRegs.size;
      }

      summarySheet.addRow([
        project.name || 'Untitled project',
        activeBeneficiaryCountByProject.get(key) || 0,
        totalActivities,
        regStats?.present || 0,
        regStats?.absent || 0,
        regStats?.registered || 0,
      ]);
    });

    const beneficiariesSheet = workbook.addWorksheet('Beneficiaries_Detail');
    beneficiariesSheet.addRow([
      'Project Id',
      'Project Name',
      'Email',
      'Status',
      'Joined at',
      'Last updated',
    ]);

    (beneficiaries as any[]).forEach((doc) => {
      const key = doc.project.toString();
      const project = projectById.get(key);
      beneficiariesSheet.addRow([
        key,
        project?.name || '',
        doc.email || '',
        doc.status || '',
        doc.createdAt || '',
        doc.updatedAt || '',
      ]);
    });

    const activitiesSheet = workbook.addWorksheet('Activities_Detail');
    activitiesSheet.addRow(['Project Id', 'Project Name', 'Activity Id', 'Start at', 'End at']);

    (projects as any[]).forEach((project) => {
      try {
        const schedule: Array<{ activityId: number; startAt?: Date; endAt?: Date }> = Array.isArray(
          project.activitySchedule,
        )
          ? ((project.activitySchedule as any[]) || []).map((item) => ({
              activityId: Number((item as any).activityId),
              startAt: (item as any).startAt as Date | undefined,
              endAt: (item as any).endAt as Date | undefined,
            }))
          : [];

        schedule.forEach((entry) => {
          if (!Number.isFinite(entry.activityId)) return;
          activitiesSheet.addRow([
            project._id.toString(),
            project.name || '',
            entry.activityId,
            entry.startAt || '',
            entry.endAt || '',
          ]);
        });
      } catch (scheduleError) {
        console.error('Failed to include activity schedule in exportProjectSummaryWorkbook', scheduleError);
      }
    });

    const attendanceSheet = workbook.addWorksheet('Attendance_Detail');
    attendanceSheet.addRow([
      'Project Id',
      'Project Name',
      'Activity Id',
      'Participant Email',
      'Status',
      'Updated at',
    ]);

    (registrations as any[]).forEach((reg) => {
      const key = reg.project.toString();
      const project = projectById.get(key);
      const updatedAt = reg.updatedAt || reg.createdAt || '';
      attendanceSheet.addRow([
        key,
        project?.name || '',
        reg.activityId,
        reg.participantEmail || '',
        reg.status || '',
        updatedAt,
      ]);
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="unihub-project-summary.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error exporting project summary workbook', error);
    return res.status(500).json({ message: 'Failed to export project summary workbook' });
  }
};

export const listProjectBeneficiaries = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const docs = await ProjectBeneficiary.find({ project: project._id, status: { $ne: 'removed' } })
      .sort({ createdAt: 1 })
      .lean();

    const result = docs.map((doc) => ({
      email: doc.email,
      status: doc.status,
      joinedAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    return res.json(result);
  } catch (error) {
    console.error('Error listing project beneficiaries', error);
    return res.status(500).json({ message: 'Failed to load project beneficiaries' });
  }
};

export const updateProjectBeneficiary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, status } = req.body as { email?: string; status?: string };

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required to update beneficiary' });
    }

    const allowedStatuses: Array<'active' | 'removed'> = ['active', 'removed'];
    if (!status || !allowedStatuses.includes(status as 'active' | 'removed')) {
      return res.status(400).json({ message: 'Status must be either "active" or "removed"' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const updated = await ProjectBeneficiary.findOneAndUpdate(
      { project: project._id, email },
      { $set: { status } },
      { new: true, upsert: true },
    ).lean();

    if (!updated) {
      return res.status(500).json({ message: 'Failed to update project beneficiary' });
    }

    return res.json({
      email: updated.email,
      status: updated.status,
      joinedAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error('Error updating project beneficiary', error);
    return res.status(500).json({ message: 'Failed to update project beneficiary' });
  }
};

export const upsertActivityEvaluation = async (req: Request, res: Response) => {
  try {
    const { id, activityId } = req.params;
    const { email, collegeDept, ratings, comments, suggestions } = req.body as {
      email?: string;
      collegeDept?: string;
      ratings?: Record<string, number>;
      comments?: string;
      suggestions?: string;
    };

    const trimmedEmail = typeof email === 'string' ? email.trim() : '';
    if (!trimmedEmail) {
      return res.status(400).json({ message: 'Email is required to submit an activity evaluation' });
    }

    const rawActivityId = Array.isArray(activityId) ? activityId[0] : activityId;
    const numericActivityId = Number.parseInt(rawActivityId, 10);
    if (!Number.isFinite(numericActivityId) || numericActivityId < 0) {
      return res.status(400).json({ message: 'Invalid activityId' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const registration = await ActivityRegistration.findOne({
      project: project._id,
      activityId: numericActivityId,
      participantEmail: trimmedEmail,
    }).lean();

    if (!registration) {
      return res
        .status(400)
        .json({ message: 'You must be registered for this activity to submit an evaluation' });
    }

    const safeRatings =
      ratings && typeof ratings === 'object'
        ? Object.fromEntries(
            Object.entries(ratings)
              .filter(([key, value]) => key && Number.isFinite(Number(value)))
              .map(([key, value]) => [key, Number(value)]),
          )
        : {};

    const update: any = {
      project: project._id,
      activityId: numericActivityId,
      participantEmail: trimmedEmail,
      ratings: safeRatings,
      collegeDept: typeof collegeDept === 'string' && collegeDept.trim() ? collegeDept.trim() : undefined,
      comments: typeof comments === 'string' ? comments.trim() : '',
      suggestions: typeof suggestions === 'string' ? suggestions.trim() : '',
    };

    const doc = await ActivityEvaluation.findOneAndUpdate(
      {
        project: project._id,
        activityId: numericActivityId,
        participantEmail: trimmedEmail,
      },
      { $set: update },
      { new: true, upsert: true },
    ).lean();

    return res.json({
      projectId: doc?.project?.toString() ?? id,
      activityId: doc?.activityId ?? numericActivityId,
      participantEmail: doc?.participantEmail ?? trimmedEmail,
      collegeDept: doc?.collegeDept ?? '',
      ratings: (doc as any)?.ratings ?? {},
      comments: doc?.comments ?? '',
      suggestions: doc?.suggestions ?? '',
      createdAt: doc?.createdAt,
      updatedAt: doc?.updatedAt,
    });
  } catch (error) {
    console.error('Error saving activity evaluation', error);
    return res.status(500).json({ message: 'Failed to save activity evaluation' });
  }
};

export const listActivityEvaluations = async (req: Request, res: Response) => {
  try {
    const { id, activityId } = req.params;

    const rawActivityId = Array.isArray(activityId) ? activityId[0] : activityId;
    const numericActivityId = Number.parseInt(rawActivityId, 10);
    if (!Number.isFinite(numericActivityId) || numericActivityId < 0) {
      return res.status(400).json({ message: 'Invalid activityId' });
    }

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const rawEmail = req.query.email as string | string[] | undefined;
    const email = Array.isArray(rawEmail) ? rawEmail[0]?.trim() : (rawEmail || '').trim();

    const filter: any = {
      project: project._id,
      activityId: numericActivityId,
    };

    if (email) {
      filter.participantEmail = email;
    }

    const docs = await ActivityEvaluation.find(filter).sort({ createdAt: 1 }).lean();

    const result = docs.map((doc) => ({
      projectId: doc.project.toString(),
      activityId: doc.activityId,
      participantEmail: doc.participantEmail,
      collegeDept: doc.collegeDept ?? '',
      ratings: (doc as any).ratings ?? {},
      comments: doc.comments ?? '',
      suggestions: doc.suggestions ?? '',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    return res.json(result);
  } catch (error) {
    console.error('Error listing activity evaluations', error);
    return res.status(500).json({ message: 'Failed to load activity evaluations' });
  }
};

export const listProjectEvaluationSummaries = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await Project.findById(id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const docs = await ActivityEvaluation.find({ project: project._id }).lean();
    if (!docs.length) {
      return res.json([]);
    }

    const titleByActivityId = new Map<number, string>();
    try {
      const proposal: any = (project as any).proposalData;
      const trainingSnapshot = proposal && proposal['training-design'];

      if (trainingSnapshot && Array.isArray(trainingSnapshot.editableCells)) {
        const cells: string[] = trainingSnapshot.editableCells;
        let indexCounter = 0;

        for (let i = 0; i + 1 < cells.length; i += 2) {
          const title = (cells[i] || '').trim();
          const resourcePerson = (cells[i + 1] || '').trim();

          if (!title) {
            continue;
          }

          titleByActivityId.set(indexCounter, title);
          indexCounter += 1;
        }
      }
    } catch (parseError) {
      console.error('Failed to derive activity titles for listProjectEvaluationSummaries', parseError);
    }

    const summaryByActivity = new Map<
      number,
      {
        totalResponses: number;
        totalScore: number;
        ratingCount: number;
        perQuestion: Map<string, { sum: number; count: number }>;
      }
    >();

    (docs as any[]).forEach((doc) => {
      const activityIdNum = Number(doc.activityId);
      if (!Number.isFinite(activityIdNum)) {
        return;
      }

      let entry = summaryByActivity.get(activityIdNum);
      if (!entry) {
        entry = {
          totalResponses: 0,
          totalScore: 0,
          ratingCount: 0,
          perQuestion: new Map<string, { sum: number; count: number }>(),
        };
        summaryByActivity.set(activityIdNum, entry);
      }

      entry.totalResponses += 1;

      const ratings: Record<string, number> = (doc as any).ratings ?? {};
      Object.entries(ratings).forEach(([key, value]) => {
        const numeric = Number(value);
        if (!key || !Number.isFinite(numeric)) return;

        entry.totalScore += numeric;
        entry.ratingCount += 1;

        const existing = entry.perQuestion.get(key) || { sum: 0, count: 0 };
        existing.sum += numeric;
        existing.count += 1;
        entry.perQuestion.set(key, existing);
      });
    });

    const result = Array.from(summaryByActivity.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([activityId, entry]) => {
        const perQuestionAverages: Record<string, number> = {};
        entry.perQuestion.forEach((value, key) => {
          perQuestionAverages[key] = value.count > 0 ? value.sum / value.count : 0;
        });

        const overallAverage = entry.ratingCount > 0 ? entry.totalScore / entry.ratingCount : 0;

        const activityTitle = titleByActivityId.get(activityId) ?? `Activity ${activityId + 1}`;

        return {
          activityId,
          activityTitle,
          totalResponses: entry.totalResponses,
          overallAverage,
          perQuestionAverages,
        };
      });

    return res.json(result);
  } catch (error) {
    console.error('Error listing project evaluation summaries', error);
    return res.status(500).json({ message: 'Failed to load project evaluation summaries' });
  }
};
