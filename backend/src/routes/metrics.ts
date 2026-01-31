import { Router } from 'express';
import { getAdminStats, getLeaderStats } from '../controllers/metricsController';

const router = Router();

router.get('/admin-stats', getAdminStats);
router.get('/leader-stats', getLeaderStats);

export default router;
