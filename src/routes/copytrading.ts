import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { verifyTrader, getTraderStats, isValidAddress } from '../services/polymarket';
import {
  createCopyTradingConfig,
  getUserCopyTradingConfigs,
  getCopyTradingConfig,
  updateCopyTradingConfig,
  enableCopyTrading,
  disableCopyTrading,
  authorizeCopyTrading,
  deleteCopyTradingConfig,
} from '../services/copytrading';
import { prisma } from '../config/database';

const router = Router();

/**
 * @swagger
 * /copytrading/trader/verify:
 *   post:
 *     summary: Verify a Polymarket trader address and get trader information
 *     tags: [Copy Trading]
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
 *                 description: Polymarket trader wallet address
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *     responses:
 *       200:
 *         description: Trader information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                 isValid:
 *                   type: boolean
 *                 totalTrades:
 *                   type: number
 *                 totalVolume:
 *                   type: string
 *                 activePositions:
 *                   type: number
 *                 lastTradeTimestamp:
 *                   type: number
 *                 marketsTraded:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Invalid address format
 */
router.post('/trader/verify', async (req: Request, res: Response) => {
  try {
    const { address } = req.body;

    if (!address || typeof address !== 'string') {
      res.status(400).json({ error: 'Address is required' });
      return;
    }

    // Validate address format
    if (!isValidAddress(address)) {
      res.status(400).json({ error: 'Invalid Ethereum address format' });
      return;
    }

    // Verify trader
    const traderInfo = await verifyTrader(address);

    if (!traderInfo.isValid) {
      res.status(404).json({
        error: 'Trader not found on Polymarket or has no trading history',
        traderInfo,
      });
      return;
    }

    // Get additional stats
    try {
      const stats = await getTraderStats(address);
      res.json({
        ...traderInfo,
        stats,
      });
    } catch (error) {
      // If stats fail, still return basic info
      res.json(traderInfo);
    }
  } catch (error) {
    console.error('Error verifying trader:', error);
    res.status(500).json({
      error: 'Failed to verify trader',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /copytrading/config/check-relayer-authorization:
 *   get:
 *     summary: Check if relayer is already an owner of user's Safe
 *     description: |
 *       Checks if the relayer is already an owner of the user's Safe wallet.
 *       If relayer is owner, no authorization transaction is needed.
 *       Use this before preparing authorization transaction to skip unnecessary steps.
 *     tags: [Copy Trading]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Relayer authorization status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 relayerIsOwner:
 *                   type: boolean
 *                   description: True if relayer is already an owner
 *                 safeAddress:
 *                   type: string
 *                   description: User's Safe wallet address
 *                 relayerAddress:
 *                   type: string
 *                   description: Relayer address being checked
 *                 owners:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: List of Safe owners
 *                 message:
 *                   type: string
 *                   description: Helpful message about authorization status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User or Safe wallet not found
 */
router.get('/config/check-relayer-authorization', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get user's Safe wallet
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.proxyWallet) {
      res.status(404).json({ error: 'User does not have a Safe wallet. Please complete signup first.' });
      return;
    }

    // Authorization is no longer required - derived wallets handle everything
    // Return success for backward compatibility
    res.json({
      relayerIsOwner: true, // Always true - no longer checking
      safeAddress: user.proxyWallet,
      message: 'Authorization not required. Derived wallets handle all operations.',
    });
  } catch (error) {
    console.error('Error checking relayer authorization:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to check authorization';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/prepare:
 *   post:
 *     summary: Prepare copy trading configuration with authorization transaction
 *     description: |
 *       Validates the configuration and prepares an authorization transaction.
 *       The configuration is NOT created until the user signs and confirms the authorization.
 *       This ensures users approve the relayer before any configuration is saved.
 *       Note: If relayer is already an owner, transaction will be null.
 *     tags: [Copy Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - targetTraderAddress
 *               - copyBuyTrades
 *               - copySellTrades
 *               - amountType
 *               - buyAmount
 *               - sellAmount
 *             properties:
 *               targetTraderAddress:
 *                 type: string
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
 *         description: Authorization transaction prepared (config not created yet)
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/config/prepare', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const {
      targetTraderAddress,
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
    } = req.body;

    // Validate required fields
    if (!targetTraderAddress || copyBuyTrades === undefined || copySellTrades === undefined ||
        !amountType || !buyAmount || !sellAmount) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const { prepareConfigWithAuthorization } = await import('../services/copytrading');
    const result = await prepareConfigWithAuthorization(userId, {
      targetTraderAddress,
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
    });

    res.json(result);
  } catch (error) {
    console.error('Error preparing copy trading config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to prepare configuration';
    const statusCode = errorMessage.includes('not found') || errorMessage.includes('Invalid') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config:
 *   post:
 *     summary: Create a copy trading configuration (DEPRECATED - use /config/prepare instead)
 *     description: |
 *       ⚠️ DEPRECATED: This endpoint creates config without authorization.
 *       Use /config/prepare instead, which requires authorization first.
 *     tags: [Copy Trading]
 *     security:
 *       - bearerAuth: []
 *     deprecated: true
 */
router.post('/config', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const {
      targetTraderAddress,
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
    } = req.body;

    // Validate required fields
    if (!targetTraderAddress || copyBuyTrades === undefined || copySellTrades === undefined ||
        !amountType || !buyAmount || !sellAmount) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const config = await createCopyTradingConfig(userId, {
      targetTraderAddress,
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
    });

    res.json(config);
  } catch (error) {
    console.error('Error creating copy trading config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create configuration';
    const statusCode = errorMessage.includes('not found') || errorMessage.includes('Invalid') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config:
 *   get:
 *     summary: Get all copy trading configurations for the authenticated user
 *     tags: [Copy Trading]
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

    const configs = await getUserCopyTradingConfigs(userId);
    res.json(configs);
  } catch (error) {
    console.error('Error getting copy trading configs:', error);
    res.status(500).json({ error: 'Failed to get configurations' });
  }
});

/**
 * @swagger
 * /copytrading/config/{configId}:
 *   get:
 *     summary: Get a specific copy trading configuration
 *     tags: [Copy Trading]
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

    const config = await getCopyTradingConfig(configId, userId);
    if (!config) {
      res.status(404).json({ error: 'Configuration not found' });
      return;
    }

    res.json(config);
  } catch (error) {
    console.error('Error getting copy trading config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * @swagger
 * /copytrading/config/{configId}:
 *   put:
 *     summary: Update a copy trading configuration
 *     tags: [Copy Trading]
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
    const config = await updateCopyTradingConfig(configId, userId, updates);
    res.json(config);
  } catch (error) {
    console.error('Error updating copy trading config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update configuration';
    const statusCode = errorMessage.includes('not found') ? 404 : 400;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/{configId}:
 *   delete:
 *     summary: Delete a copy trading configuration
 *     tags: [Copy Trading]
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

    await deleteCopyTradingConfig(configId, userId);
    res.json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    console.error('Error deleting copy trading config:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete configuration';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/create-and-authorize:
 *   post:
 *     summary: Create copy trading configuration and confirm authorization (after user signs)
 *     description: |
 *       Creates the copy trading configuration AND confirms authorization in one step.
 *       This is called after the user signs the authorization transaction from /config/prepare.
 *     tags: [Copy Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - configData
 *             properties:
 *               signedTransaction:
 *                 type: object
 *                 nullable: true
 *                 description: |
 *                   Signed transaction from user's wallet.
 *                   Can be null if relayer is already an owner of the Safe.
 *                   Required if relayer is not an owner.
 *               configData:
 *                 type: object
 *                 description: Configuration data from /config/prepare
 *     responses:
 *       200:
 *         description: Configuration created and authorized
 */
router.post('/config/create-and-authorize', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { signedTransaction, configData } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!configData) {
      res.status(400).json({ error: 'Configuration data is required' });
      return;
    }

    // Check if relayer is already owner (signedTransaction can be null in this case)
    const { config: appConfig } = await import('../config/env');
    const { getSafeOwners } = await import('../services/wallet');
    const { ethers } = await import('ethers');
    const prisma = (await import('../config/database')).prisma;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    // Authorization is no longer required - derived wallets handle everything via CLOB client
    // Skip relayer authorization check for backward compatibility
    console.log('✅ Skipping relayer authorization check. Derived wallets handle all operations via CLOB client.');

    const { createConfigWithAuthorization } = await import('../services/copytrading');
    // Pass null since authorization is no longer needed
    const result = await createConfigWithAuthorization(
      userId, 
      configData, 
      null // No authorization transaction needed
    );
    res.json(result);
  } catch (error) {
    console.error('Error creating config with authorization:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create configuration';
    const statusCode = errorMessage.includes('not found') ? 404 : errorMessage.includes('already') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/{configId}/authorize/prepare:
 *   post:
 *     summary: Prepare authorization transaction (returns unsigned transaction for user to sign) - for existing configs
 *     tags: [Copy Trading]
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
 *         description: Authorization transaction prepared
 */
router.post('/config/:configId/authorize/prepare', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { prepareAuthorizationTransaction } = await import('../services/copytrading');
    const result = await prepareAuthorizationTransaction(configId, userId);
    res.json(result);
  } catch (error) {
    console.error('Error preparing authorization transaction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to prepare authorization';
    const statusCode = errorMessage.includes('not found') ? 404 : errorMessage.includes('already') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/{configId}/authorize/confirm:
 *   post:
 *     summary: Confirm authorization transaction (after user signs) - for existing configs
 *     tags: [Copy Trading]
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
 *             required:
 *               - signedTransaction
 *             properties:
 *               signedTransaction:
 *                 type: object
 *                 description: Signed transaction from user's wallet
 *     responses:
 *       200:
 *         description: Authorization confirmed
 */
router.post('/config/:configId/authorize/confirm', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;
    const { signedTransaction } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!signedTransaction) {
      res.status(400).json({ error: 'Signed transaction is required' });
      return;
    }

    const { confirmAuthorizationTransaction } = await import('../services/copytrading');
    const result = await confirmAuthorizationTransaction(configId, userId, signedTransaction);
    res.json(result);
  } catch (error) {
    console.error('Error confirming authorization:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to confirm authorization';
    const statusCode = errorMessage.includes('not found') ? 404 : errorMessage.includes('already') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/{configId}/authorize:
 *   post:
 *     summary: Authorize copy trading (legacy - simple authorization without transaction)
 *     tags: [Copy Trading]
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
 *         description: Copy trading authorized
 */
router.post('/config/:configId/authorize', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await authorizeCopyTrading(configId, userId);
    res.json(config);
  } catch (error) {
    console.error('Error authorizing copy trading:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to authorize copy trading';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/{configId}/enable:
 *   post:
 *     summary: Enable copy trading (requires authorization)
 *     tags: [Copy Trading]
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
 *         description: Copy trading enabled
 */
router.post('/config/:configId/enable', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await enableCopyTrading(configId, userId);
    res.json(config);
  } catch (error) {
    console.error('Error enabling copy trading:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to enable copy trading';
    const statusCode = errorMessage.includes('not found') ? 404 : errorMessage.includes('authorized') ? 400 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/{configId}/disable:
 *   post:
 *     summary: Disable copy trading
 *     tags: [Copy Trading]
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
 *         description: Copy trading disabled
 */
router.post('/config/:configId/disable', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { configId } = req.params;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const config = await disableCopyTrading(configId, userId);
    res.json(config);
  } catch (error) {
    console.error('Error disabling copy trading:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to disable copy trading';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /copytrading/config/authorize/execute-backend:
 *   post:
 *     summary: Execute signed Safe authorization transaction from backend
 *     description: |
 *       Executes a signed Safe transaction using the backend's Safe SDK.
 *       This endpoint is used when frontend execution fails with GS013 error.
 *       The backend reconstructs and executes the transaction properly.
 *     tags: [Copy Trading]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - safeAddress
 *               - signedTransaction
 *             properties:
 *               safeAddress:
 *                 type: string
 *                 description: The Safe wallet address
 *               signedTransaction:
 *                 type: object
 *                 description: Signed transaction data from frontend
 *     responses:
 *       200:
 *         description: Transaction executed successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Execution failed
 */
router.post('/config/authorize/execute-backend', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { safeAddress, signedTransaction } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!safeAddress || !signedTransaction) {
      res.status(400).json({ error: 'safeAddress and signedTransaction are required' });
      return;
    }

    // Get user's Safe address to verify ownership
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.proxyWallet || user.proxyWallet.toLowerCase() !== safeAddress.toLowerCase()) {
      res.status(403).json({ error: 'Safe address does not belong to user' });
      return;
    }

    // Import here to avoid circular dependency
    const { config: appConfig } = await import('../config/env');
    const { executeSignedSafeTransaction } = await import('../services/safe-authorization');
    const { isDeployerSafeOwner, getSafeOwners } = await import('../services/wallet');

    // Check if deployer is an owner before attempting execution
    if (!appConfig.blockchain.deployerPrivateKey) {
      res.status(500).json({ 
        error: 'Backend execution not configured. DEPLOYER_PRIVATE_KEY not set.' 
      });
      return;
    }

    // Check if deployer is an owner
    const deployerIsOwner = await isDeployerSafeOwner(safeAddress);
    
    if (!deployerIsOwner) {
      // Get current owners for helpful error message
      const owners = await getSafeOwners(safeAddress);
      const deployerWallet = new (await import('ethers')).Wallet(appConfig.blockchain.deployerPrivateKey);
      
      res.status(403).json({
        error: 'Deployer is not an owner of this Safe.',
        details: {
          deployerAddress: deployerWallet.address,
          safeAddress: safeAddress,
          currentOwners: owners,
          message: 'Backend execution requires deployer to be an owner. ' +
                   'Please execute the transaction from the frontend, or add deployer as owner first.',
        },
      });
      return;
    }

    try {
      const receipt = await executeSignedSafeTransaction(
        safeAddress,
        appConfig.blockchain.deployerPrivateKey,
        signedTransaction
      );

      res.json({
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
      });
    } catch (error: any) {
      // If execution fails, provide helpful error
      if (error.message?.includes('GS013') || error.message?.includes('not enough')) {
        res.status(400).json({
          error: 'Transaction execution failed: Not enough valid signatures.',
          details: error.message,
        });
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error executing authorization transaction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute transaction';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

