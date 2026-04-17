import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getGlobalLeaderboard, getAroundMeLeaderboard, getTierLeaderboard } from '../services/leaderboard';
import { RankTier } from '../services/elo';

const router = Router();
const VALID_TIERS = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];

router.get('/global', authMiddleware, async (req, res, next) => {
  try {
    const data = await getGlobalLeaderboard(req.user.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/around-me', authMiddleware, async (req, res, next) => {
  try {
    const data = await getAroundMeLeaderboard(req.user.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

router.get('/tier/:tier', authMiddleware, async (req, res, next) => {
  try {
    const tier = req.params.tier.toUpperCase();
    if (!VALID_TIERS.includes(tier)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TIER', message: 'Invalid rank tier' },
      });
    }
    const data = await getTierLeaderboard(tier as RankTier, req.user.id);
    res.json({ success: true, data });
  } catch (e) { next(e); }
});

export default router;
