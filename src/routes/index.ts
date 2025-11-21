import { Router } from 'express';
import authRoutes from './auth';
import depositRoutes from './deposit';
import depositSseRoutes from './deposit-sse';
import copytradingRoutes from './copytrading';
import copySignalsRoutes from './copy-signals';
import analyticsRoutes from './analytics';
import walletRoutes from './wallet';
import tradeHistoryRoutes from './trade-history';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   example: 2024-01-01T00:00:00.000Z
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Authentication routes
router.use('/auth', authRoutes);

// Deposit routes
router.use('/deposit', depositRoutes);
router.use('/deposit', depositSseRoutes); // SSE routes for real-time deposit tracking

// Copy trading routes
router.use('/copytrading', copytradingRoutes);

// Copy signals routes
router.use('/copy-signals', copySignalsRoutes);

// Analytics routes
router.use('/analytics', analyticsRoutes);

// Wallet routes
router.use('/wallet', walletRoutes);

// Trade history routes
router.use('/trade-history', tradeHistoryRoutes);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                 address:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/auth/me', authenticateToken, (req: AuthRequest, res) => {
  res.json({
    userId: req.userId,
    address: req.userAddress,
  });
});

export default router;

