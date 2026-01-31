import { Router } from 'express';
import {
  login,
  register,
  getAllUsers,
  getUserById,
  updateUserBasic,
  deleteUser,
  changePassword,
} from '../controllers/authController';
import { getOnlineUserIds } from '../socket';

const router = Router();

router.post('/login', login);
router.post('/register', register);
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id', updateUserBasic);
router.patch('/users/:id/password', changePassword);
router.get('/online-users', (_req, res) => {
  res.json({ userIds: getOnlineUserIds() });
});
router.delete('/users/:id', deleteUser);

export default router;
