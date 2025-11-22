import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import {
  createCopySignalConfig,
  getUserCopySignalConfigs,
  getCopySignalConfig,
  updateCopySignalConfig,
  enableCopySignals,
  disableCopySignals,
  authorizeCopySignals,
  deleteCopySignalConfig,
} from '../services/copy-signals';

const router: Router = Router();

/**
 * @swagger
 * /copy-signals/config:
 *   post:
 *     summary: Create a copy signal configuration
 *     tags: [Copy Signals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - signalCategories
 *               - copyBuyTrades
 *               - copySellTrades
 *               - amountType
 *               - buyAmount
 *               - sellAmount
 *             properties:
 *               signalCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of signal categories to copy
 *               copyBuyTrades:
 *                 type: boolean
 *               copySellTrades:
 *                 type: boolean
 *               amountType:
 *                 type: string
 *                 enum: [fixed, percentage, percentageOfOriginal]
 *               buyAmount:
 *                 type: string
 *               sellAmount:
 *                 type: string
 *               minBuyAmount:
 *                 type: string
 *               maxBuyAmount:
 *                 type: string
 *               minSellAmount:
 *                 type: string
 *               maxSellAmount:
 *                 type: string
 *               marketCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Configuration created
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const {
      signalCategories,
      copyBuyTrades,
      copySellTrades,
      amountType,
      buyAmount,
      sellAmount,
      minBuyAmount,
      maxBuyAmount,
      minSellAmount,
      maxSellAmount,
      marketCategories,
      allocatedUSDCAmount,
    } = req.body;

    // Validate required fields
    if (!signalCategories || !Array.isArray(signalCategories) || signalCategories.length === 0 ||
        copyBuyTrades === undefined || copySellTrades === undefined ||
        !amountType || !buyAmount || !allocatedUSDCAmount) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    
    // sellAmount is required only if copySellTrades is true
    if (copySellTrades && !sellAmount) {
      res.status(400).json({ error: 'sellAmount is required when copySellTrades is true' });
      return;
    }

    const config = await createCopySignalConfig(userId, {
      signalCategories,
      copyBuyTrades,
      copySellTrades,
      amountType,
      buyAmount,
      sellAmount,
      minBuyAmount,
      maxBuyAmount,
      minSellAmount,
      maxSellAmount,
      marketCategories,
      allocatedUSDCAmount,
    });

    res.json(config);
  } catch (error) {
    console.error('Error creating copy signal config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create configuration';
    const statusCode = errorMessage.includes('not found') || errorMessage.includes('Invalid') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copy-signals/config:
 *   get:
 *     summary: Get all copy signal configurations for the authenticated user
 *     tags: [Copy Signals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of configurations
 */
router.get('/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const configs = await getUserCopySignalConfigs(userId);
    res.json(configs);
  } catch (error) {
    console.error('Error getting copy signal configs:', error);
    res.status(500).json({ error: 'Failed to get configurations' });
  }
});

/**
 * @swagger
 * /copy-signals/config/{configId}:
 *   get:
 *     summary: Get a specific copy signal configuration
 *     tags: [Copy Signals]
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
 *         description: Configuration details
 *       404:
 *         description: Configuration not found
 */
router.get('/config/:configId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await getCopySignalConfig(configId, userId);
    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    res.json(config);
  } catch (error) {
    console.error('Error getting copy signal config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * @swagger
 * /copy-signals/config/{configId}:
 *   put:
 *     summary: Update a copy signal configuration
 *     tags: [Copy Signals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: configId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               signalCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *               copyBuyTrades:
 *                 type: boolean
 *               copySellTrades:
 *                 type: boolean
 *               amountType:
 *                 type: string
 *               buyAmount:
 *                 type: string
 *               sellAmount:
 *                 type: string
 *               minBuyAmount:
 *                 type: string
 *               maxBuyAmount:
 *                 type: string
 *               minSellAmount:
 *                 type: string
 *               maxSellAmount:
 *                 type: string
 *               marketCategories:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Configuration updated
 */
router.put('/config/:configId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const updates = req.body;
    const config = await updateCopySignalConfig(configId, userId, updates);
    res.json(config);
  } catch (error) {
    console.error('Error updating copy signal config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update configuration';
    const statusCode = errorMessage.includes('not found') ? 404 : 400;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copy-signals/config/{configId}:
 *   delete:
 *     summary: Delete a copy signal configuration
 *     tags: [Copy Signals]
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
 *         description: Configuration deleted
 */
router.delete('/config/:configId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    await deleteCopySignalConfig(configId, userId);
    res.json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting copy signal config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete configuration';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copy-signals/config/{configId}/authorize:
 *   post:
 *     summary: Authorize copy signals
 *     tags: [Copy Signals]
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
 *         description: Copy signals authorized
 */
router.post('/config/:configId/authorize', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await authorizeCopySignals(configId, userId);
    res.json(config);
  } catch (error) {
    console.error('Error authorizing copy signals:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to authorize copy signals';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copy-signals/config/{configId}/enable:
 *   post:
 *     summary: Enable copy signals (requires authorization)
 *     tags: [Copy Signals]
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
 *         description: Copy signals enabled
 */
router.post('/config/:configId/enable', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await enableCopySignals(configId, userId);
    res.json(config);
  } catch (error) {
    console.error('Error enabling copy signals:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to enable copy signals';
    const statusCode = errorMessage.includes('not found') ? 404 : errorMessage.includes('authorized') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copy-signals/config/{configId}/disable:
 *   post:
 *     summary: Disable copy signals
 *     tags: [Copy Signals]
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
 *         description: Copy signals disabled
 */
router.post('/config/:configId/disable', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await disableCopySignals(configId, userId);
    res.json(config);
  } catch (error) {
    console.error('Error disabling copy signals:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to disable copy signals';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

export default router;

