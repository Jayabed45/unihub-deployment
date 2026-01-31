import { Router } from 'express';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  createNotification,
} from '../controllers/notificationController';

const router = Router();

router.get('/', listNotifications);
router.post('/', createNotification);
router.patch('/:id/read', markNotificationRead);
router.post('/mark-read-all', markAllNotificationsRead);

export default router;
