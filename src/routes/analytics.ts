import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  getConfigStatistics,
  getUserStatistics,
  getTraderStatistics,
  getConfigTradeHistory,
  getUserTradeHistory,
} from '../services/trade-analytics';
import {
  getTradeLifecycle,
  getTradesLifecycle,
  getEnhancedStatistics,
} from '../services/trade-lifecycle-analytics';
import { prisma } from '../config/database';

const router: Router = Router();

/**
 * @swagger
 * /analytics/stats:
 *   get:
 *     summary: Get overall copy trading statistics for authenticated user
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics
 */
router.get('/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const stats = await getUserStatistics(userId);
    res.json(stats);
  } catch (error) {
    console.error('Error getting user statistics:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /analytics/config/{configId}/stats:
 *   get:
 *     summary: Get statistics for a specific copy trading configuration
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Configuration statistics
 */
router.get('/config/:configId/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const stats = await getConfigStatistics(configId, userId);
    res.json(stats);
  } catch (error) {
    console.error('Error getting config statistics:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get statistics';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /analytics/traders:
 *   get:
 *     summary: Get statistics per trader (grouped by trader address)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Trader statistics
 */
router.get('/traders', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const stats = await getTraderStatistics(userId);
    res.json(stats);
  } catch (error) {
    console.error('Error getting trader statistics:', error);
    res.status(500).json({
      error: 'Failed to get trader statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /analytics/config/{configId}/history:
 *   get:
 *     summary: Get detailed trade history for a configuration
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, executed, failed, skipped]
 *       - in: query
 *         name: outcome
 *         schema:
 *           type: string
 *           enum: [win, loss, pending, cancelled]
 *     responses:
 *       200:
 *         description: Trade history
 */
router.get('/config/:configId/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;
    const { limit, offset, status, outcome } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const history = await getConfigTradeHistory(configId, userId, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      status: status as string | undefined,
      outcome: outcome as string | undefined,
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting trade history:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get trade history';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /analytics/history:
 *   get:
 *     summary: Get detailed trade history for all user's copy trading
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, executed, failed, skipped]
 *       - in: query
 *         name: outcome
 *         schema:
 *           type: string
 *           enum: [win, loss, pending, cancelled]
 *       - in: query
 *         name: traderAddress
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trade history
 */
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { limit, offset, status, outcome, traderAddress } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const history = await getUserTradeHistory(userId, {
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      status: status as string | undefined,
      outcome: outcome as string | undefined,
      traderAddress: traderAddress as string | undefined,
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting trade history:', error);
    res.status(500).json({
      error: 'Failed to get trade history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /analytics/trade/{tradeId}/lifecycle:
 *   get:
 *     summary: Get complete lifecycle view of a single trade
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tradeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Complete trade lifecycle
 *       404:
 *         description: Trade not found
 */
router.get('/trade/:tradeId/lifecycle', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { tradeId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const lifecycle = await getTradeLifecycle(tradeId, userId);

    if (!lifecycle) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }

    res.json(lifecycle);
  } catch (error) {
    console.error('Error getting trade lifecycle:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get trade lifecycle';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /analytics/trades/lifecycle:
 *   get:
 *     summary: Get lifecycle view for multiple trades
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: configId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Trades lifecycle view
 */
router.get('/trades/lifecycle', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId, status, limit, offset } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await getTradesLifecycle(userId, {
      configId: configId as string | undefined,
      status: status as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    console.error('Error getting trades lifecycle:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get trades lifecycle';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /analytics/enhanced/stats:
 *   get:
 *     summary: Get enhanced statistics including redemption and slippage metrics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: configId
 *         schema:
 *           type: string
 *         description: Optional config ID to filter by
 *     responses:
 *       200:
 *         description: Enhanced statistics
 */
router.get('/enhanced/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const stats = await getEnhancedStatistics(userId, configId as string | undefined);
    res.json(stats);
  } catch (error) {
    console.error('Error getting enhanced statistics:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get enhanced statistics';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /analytics/signals/stats:
 *   get:
 *     summary: Get overall copy signal statistics for authenticated user
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User signal statistics
 */
router.get('/signals/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const configs = await prisma.copySignalConfig.findMany({
      where: { userId },
    });

    const configIds = configs.map(c => c.id);

    const signals = await prisma.copiedSignal.findMany({
      where: {
        configId: { in: configIds },
      },
    });

    const totalSignals = signals.length;
    const executedSignals = signals.filter(s => s.status === 'settled' || s.status === 'executed').length;
    const failedSignals = signals.filter(s => s.status === 'failed').length;
    const pendingSignals = signals.filter(s => s.status === 'pending').length;

    const totalPnl = signals
      .filter(s => s.pnl !== null)
      .reduce((sum, s) => sum + parseFloat(s.pnl || '0'), 0);

    const winCount = signals.filter(s => s.outcome === 'win').length;
    const lossCount = signals.filter(s => s.outcome === 'loss').length;

    res.json({
      totalSignals,
      executedSignals,
      failedSignals,
      pendingSignals,
      totalPnl: totalPnl.toFixed(2),
      winCount,
      lossCount,
      winRate: winCount + lossCount > 0 ? ((winCount / (winCount + lossCount)) * 100).toFixed(2) : '0.00',
    });
  } catch (error) {
    console.error('Error getting signal statistics:', error);
    res.status(500).json({
      error: 'Failed to get signal statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /analytics/signals/config/{configId}/stats:
 *   get:
 *     summary: Get statistics for a specific copy signal configuration
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Configuration signal statistics
 */
router.get('/signals/config/:configId/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await prisma.copySignalConfig.findFirst({
      where: {
        id: configId,
        userId,
      },
    });

    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    const signals = await prisma.copiedSignal.findMany({
      where: { configId },
    });

    const totalSignals = signals.length;
    const executedSignals = signals.filter(s => s.status === 'settled' || s.status === 'executed').length;
    const failedSignals = signals.filter(s => s.status === 'failed').length;
    const pendingSignals = signals.filter(s => s.status === 'pending').length;

    const totalPnl = signals
      .filter(s => s.pnl !== null)
      .reduce((sum, s) => sum + parseFloat(s.pnl || '0'), 0);

    const winCount = signals.filter(s => s.outcome === 'win').length;
    const lossCount = signals.filter(s => s.outcome === 'loss').length;

    res.json({
      configId,
      totalSignals,
      executedSignals,
      failedSignals,
      pendingSignals,
      totalPnl: totalPnl.toFixed(2),
      winCount,
      lossCount,
      winRate: winCount + lossCount > 0 ? ((winCount / (winCount + lossCount)) * 100).toFixed(2) : '0.00',
    });
  } catch (error) {
    console.error('Error getting signal config statistics:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get statistics';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /analytics/signals/config/{configId}/history:
 *   get:
 *     summary: Get signal history for a configuration
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, executed, failed, skipped, settled]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Signal history
 */
router.get('/signals/config/:configId/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;
    const { limit, offset, status, category } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await prisma.copySignalConfig.findFirst({
      where: {
        id: configId,
        userId,
      },
    });

    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    const where: any = { configId };
    if (status) {
      where.status = status;
    }
    if (category) {
      where.category = category;
    }

    const signals = await prisma.copiedSignal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit as string, 10) : 50,
      skip: offset ? parseInt(offset as string, 10) : 0,
    });

    const total = await prisma.copiedSignal.count({ where });

    res.json({
      signals,
      total,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    console.error('Error getting signal history:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get signal history';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /analytics/signals/history:
 *   get:
 *     summary: Get signal history for all user's copy signal configurations
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, executed, failed, skipped, settled]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Signal history
 */
router.get('/signals/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { limit, offset, status, category } = req.query;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const configs = await prisma.copySignalConfig.findMany({
      where: { userId },
    });

    const configIds = configs.map(c => c.id);

    const where: any = {
      configId: { in: configIds },
    };
    if (status) {
      where.status = status;
    }
    if (category) {
      where.category = category;
    }

    const signals = await prisma.copiedSignal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit as string, 10) : 50,
      skip: offset ? parseInt(offset as string, 10) : 0,
    });

    const total = await prisma.copiedSignal.count({ where });

    res.json({
      signals,
      total,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });
  } catch (error) {
    console.error('Error getting signal history:', error);
    res.status(500).json({
      error: 'Failed to get signal history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

