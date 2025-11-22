import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  getTradeHistoryForConfig,
  getTradeHistoryForUser,
  getTradeStatsForConfig,
  getTradeStatsForUser,
  getFailureStats,
} from '../services/trade-history';
import { prisma } from '../config/database';

const router: Router = Router();

/**
 * @swagger
 * /api/trade-history/config/{configId}:
 *   get:
 *     summary: Get trade history for a specific copy trading config
 *     tags: [Trade History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *         description: Copy trading config ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of trades to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of trades to skip
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, executed, settled, failed, skipped]
 *         description: Filter by trade status
 *       - in: query
 *         name: tradeType
 *         schema:
 *           type: string
 *           enum: [buy, sell]
 *         description: Filter by trade type
 *     responses:
 *       200:
 *         description: Trade history retrieved successfully
 */
router.get('/config/:configId', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { configId } = req.params;
    const { limit, offset, status, tradeType } = req.query;

    // Verify user owns this config
    const config = await prisma.copyTradingConfig.findUnique({
      where: { id: configId },
      select: { userId: true },
    });

    if (!config) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }

    if (config.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const history = await getTradeHistoryForConfig(configId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as string,
      tradeType: tradeType as string,
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching trade history for config:', error);
    res.status(500).json({
      error: 'Failed to fetch trade history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/trade-history/user:
 *   get:
 *     summary: Get trade history for the authenticated user (all configs)
 *     tags: [Trade History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of trades to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of trades to skip
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, executed, settled, failed, skipped]
 *         description: Filter by trade status
 *       - in: query
 *         name: tradeType
 *         schema:
 *           type: string
 *           enum: [buy, sell]
 *         description: Filter by trade type
 *       - in: query
 *         name: configId
 *         schema:
 *           type: string
 *         description: Filter by specific config ID
 *     responses:
 *       200:
 *         description: Trade history retrieved successfully
 */
router.get('/user', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { limit, offset, status, tradeType, configId } = req.query;

    if (!req.userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const history = await getTradeHistoryForUser(req.userId, {
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
      status: status as string,
      tradeType: tradeType as string,
      configId: configId as string,
    });

    res.json(history);
  } catch (error) {
    console.error('Error fetching trade history for user:', error);
    res.status(500).json({
      error: 'Failed to fetch trade history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/trade-history/config/{configId}/stats:
 *   get:
 *     summary: Get trade statistics for a specific config
 *     tags: [Trade History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *         description: Copy trading config ID
 *     responses:
 *       200:
 *         description: Trade statistics retrieved successfully
 */
router.get('/config/:configId/stats', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { configId } = req.params;

    // Verify user owns this config
    const config = await prisma.copyTradingConfig.findUnique({
      where: { id: configId },
      select: { userId: true },
    });

    if (!config) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }

    if (config.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const stats = await getTradeStatsForConfig(configId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching trade stats for config:', error);
    res.status(500).json({
      error: 'Failed to fetch trade statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/trade-history/user/stats:
 *   get:
 *     summary: Get overall trade statistics for the authenticated user
 *     tags: [Trade History]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trade statistics retrieved successfully
 */
router.get('/user/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const stats = await getTradeStatsForUser(req.userId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching trade stats for user:', error);
    res.status(500).json({
      error: 'Failed to fetch trade statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /api/trade-history/failures:
 *   get:
 *     summary: Get failure statistics grouped by category and reason
 *     tags: [Trade History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: configId
 *         schema:
 *           type: string
 *         description: Filter by specific config ID (optional)
 *     responses:
 *       200:
 *         description: Failure statistics retrieved successfully
 */
router.get('/failures', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { configId } = req.query;

    // If configId is provided, verify user owns it
    if (configId) {
      const config = await prisma.copyTradingConfig.findUnique({
        where: { id: configId as string },
        select: { userId: true },
      });

      if (!config) {
        res.status(404).json({ error: 'Config not found' });
        return;
      }

      if (config.userId !== req.userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    if (!req.userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const stats = await getFailureStats(
      configId as string | undefined,
      configId ? undefined : req.userId
    );

    res.json(stats);
  } catch (error) {
    console.error('Error fetching failure stats:', error);
    res.status(500).json({
      error: 'Failed to fetch failure statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

