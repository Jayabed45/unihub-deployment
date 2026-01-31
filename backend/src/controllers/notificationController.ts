import { Request, Response } from 'express';
import Notification from '../models/Notification';
import Project from '../models/Project';
import User from '../models/User';
import { getIO } from '../socket';
import { sendMail } from '../utils/mailer';
import { generateEmailHtml } from '../services/email.service';

export const listNotifications = async (req: Request, res: Response) => {
  try {
    const { leaderId, leaderEmail } = req.query as { leaderId?: string; leaderEmail?: string };

    let filter: Record<string, any> = {};

    if ((leaderId && leaderId.trim()) || (leaderEmail && leaderEmail.trim())) {
      const orFilters: any[] = [];

      if (leaderId && leaderId.trim()) {
        try {
          const projects = await Project.find({ projectLeader: leaderId.trim() })
            .select({ _id: 1 })
            .lean();

          const projectIds = projects.map((p) => p._id);
          if (projectIds.length > 0) {
            orFilters.push({ project: { $in: projectIds } });
          }
        } catch (projectLookupError) {
          console.error('Failed to lookup leader projects for notifications', projectLookupError);
        }
      }

      if (leaderEmail && leaderEmail.trim()) {
        orFilters.push({ recipientEmail: leaderEmail.trim() });
      }

      if (orFilters.length > 0) {
        filter = { $or: orFilters };
      } else {
        // No matching projects/emails; ensure we return an empty list instead of all notifications
        filter = { _id: null };
      }
    }

    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    return res.json(notifications);
  } catch (error) {
    console.error('Error listing notifications', error);
    return res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      id,
      { $set: { read: true } },
      { new: true },
    ).lean();

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    return res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read', error);
    return res.status(500).json({ message: 'Failed to mark notification as read' });
  }
};

export const markAllNotificationsRead = async (_req: Request, res: Response) => {
  try {
    await Notification.updateMany({ read: false }, { $set: { read: true } });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read', error);
    return res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
};

export const createNotification = async (req: Request, res: Response) => {
  try {
    const { title, message, project, recipientEmail } = req.body as {
      title?: string;
      message?: string;
      project?: string;
      recipientEmail?: string;
    };

    if (!title || !title.trim() || !message || !message.trim()) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    const created = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      project: project || undefined,
      recipientEmail: recipientEmail && recipientEmail.trim() ? recipientEmail.trim() : undefined,
    });

    try {
      const io = getIO();
      io.emit('notification:new', {
        id: created._id.toString(),
        title: created.title,
        message: created.message,
        projectId: created.project ? created.project.toString() : undefined,
        timestamp: created.createdAt
          ? created.createdAt.toLocaleString('en-PH', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : '',
        read: created.read,
      });
    } catch (socketError) {
      console.error('Failed to emit notification over socket', socketError);
    }

    if (created.recipientEmail) {
      try {
        const projectDoc = created.project ? await Project.findById(created.project).lean() : null;

        let userDoc = null;
        if (created.title === 'Join request') {
          const emailMatch = created.message.match(/^(.*?) wants to join/);
          if (emailMatch && emailMatch[1]) {
            userDoc = await User.findOne({ email: emailMatch[1] }).lean();
          }
        } else if (created.title === 'Activity join') {
            const emailMatch = created.message.match(/^(.*?) joined activity/);
            if (emailMatch && emailMatch[1]) {
              userDoc = await User.findOne({ email: emailMatch[1] }).lean();
            }
        }

        const { subject, html } = generateEmailHtml({
          notification: created,
          project: projectDoc,
          user: userDoc,
        });

        await sendMail({
          to: created.recipientEmail,
          subject,
          html,
          text: created.message, // Fallback for email clients that do not support HTML
        });
      } catch (emailError) {
        console.error('Failed to send notification email', emailError);
      }
    }

    return res.status(201).json(created);
  } catch (error) {
    console.error('Error creating notification', error);
    return res.status(500).json({ message: 'Failed to create notification' });
  }
};
