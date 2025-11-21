import { Router, Request, Response } from 'express';
import { generateNonce, verifyAndAuthenticate, isUsernameAvailable, setUsername } from '../services/auth';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * /auth/nonce:
 *   post:
 *     summary: Generate a nonce for SIWE authentication
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *             properties:
 *               address:
 *                 type: string
 *                 description: Ethereum wallet address
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *     responses:
 *       200:
 *         description: Nonce generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nonce:
 *                   type: string
 *                   example: "a1b2c3d4e5f6..."
 *       400:
 *         description: Invalid request
 */
router.post('/nonce', async (req: Request, res: Response) => {
  try {
    const { address } = req.body;

    if (!address || typeof address !== 'string') {
      res.status(400).json({ error: 'Address is required' });
      return;
    }

    // Basic address validation (should start with 0x and be 42 chars)
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      res.status(400).json({ error: 'Invalid Ethereum address format' });
      return;
    }

    const nonce = await generateNonce(address);
    res.json({ nonce });
  } catch (error) {
    console.error('Error generating nonce:', error);
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
});

/**
 * @swagger
 * /auth/verify:
 *   post:
 *     summary: Verify SIWE signature and authenticate user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - signature
 *             properties:
 *               message:
 *                 type: string
 *                 description: SIWE message string
 *               signature:
 *                 type: string
 *                 description: Signature of the message
 *     responses:
 *       200:
 *         description: Authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     address:
 *                       type: string
 *                     username:
 *                       type: string
 *                       description: User's unique username (optional, can be set after signup)
 *                     proxyWallet:
 *                       type: string
 *                       description: Gnosis Safe proxy wallet address on Polygon (created automatically on first signin)
 *                 token:
 *                   type: string
 *                   description: JWT access token
 *       400:
 *         description: Invalid request or authentication failed
 *       401:
 *         description: Authentication failed
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { message, signature } = req.body;

    if (!message || !signature) {
      res.status(400).json({ error: 'Message and signature are required' });
      return;
    }

    const result = await verifyAndAuthenticate(message, signature);
    res.json(result);
  } catch (error) {
    console.error('Authentication error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    res.status(401).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /auth/username/check:
 *   get:
 *     summary: Check if a username is available
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username to check (3-20 characters, alphanumeric and underscores only)
 *         example: "johndoe"
 *     responses:
 *       200:
 *         description: Username availability check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                   description: Whether the username is available
 *                 username:
 *                   type: string
 *                   description: The checked username
 *       400:
 *         description: Invalid username format
 */
router.get('/username/check', async (req: Request, res: Response) => {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const available = await isUsernameAvailable(username);
    res.json({ available, username });
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({ error: 'Failed to check username availability' });
  }
});

/**
 * @swagger
 * /auth/username/set:
 *   post:
 *     summary: Set username for authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username to set (3-20 characters, alphanumeric and underscores only)
 *                 example: "johndoe"
 *     responses:
 *       200:
 *         description: Username set successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     address:
 *                       type: string
 *                     username:
 *                       type: string
 *       400:
 *         description: Invalid username format or username already taken
 *       401:
 *         description: Authentication required
 */
router.post('/username/set', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { username } = req.body;
    const userAddress = req.userAddress;

    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const updatedUser = await setUsername(userAddress, username);
    res.json({ 
      user: {
        id: updatedUser.id,
        address: updatedUser.address,
        username: updatedUser.username,
      }
    });
  } catch (error) {
    console.error('Error setting username:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to set username';
    const statusCode = errorMessage.includes('already taken') || errorMessage.includes('Invalid') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});


export default router;

