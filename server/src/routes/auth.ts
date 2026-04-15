import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

export default router;
