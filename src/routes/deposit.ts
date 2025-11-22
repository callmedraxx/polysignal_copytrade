import { Router, Request, Response } from 'express';
import {
  initiateDeposit,
  processDepositCallback,
  getDepositStatus,
  getUserDeposits,
} from '../services/deposit';
import { getUserBalance } from '../services/balance';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { config } from '../config/env';

const router: Router = Router();

/**
 * @swagger
 * /deposit/initiate:
 *   post:
 *     summary: Initiate a deposit via Onramper
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceCurrency
 *               - sourceAmount
 *             properties:
 *               sourceCurrency:
 *                 type: string
 *                 description: Source cryptocurrency (e.g., "ETH", "BTC", "USDT")
 *                 example: "ETH"
 *               sourceAmount:
 *                 type: string
 *                 description: Amount in source currency
 *                 example: "0.1"
 *     responses:
 *       200:
 *         description: Deposit initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 depositId:
 *                   type: string
 *                 onramperUrl:
 *                   type: string
 *                   description: URL to Onramper widget for completing deposit
 *                 proxyWallet:
 *                   type: string
 *                   description: User's proxy wallet address where USDC will be deposited
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 */
router.post('/initiate', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { sourceCurrency, sourceAmount } = req.body;

    if (!sourceCurrency || !sourceAmount) {
      res.status(400).json({ error: 'sourceCurrency and sourceAmount are required' });
      return;
    }

    const result = await initiateDeposit(userAddress, sourceCurrency, sourceAmount);

    res.json(result);
  } catch (error) {
    console.error('Error initiating deposit:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to initiate deposit';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/balance:
 *   get:
 *     summary: Get user's USDC balance in proxy wallet (fetched fresh from Polygon blockchain)
 *     description: |
 *       This endpoint queries the Polygon blockchain directly to get the current USDC balance.
 *       The balance is fetched in real-time and is not cached, ensuring you always get the most up-to-date balance.
 *       Checks ONLY USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174) as the accurate balance for the user proxy wallet.
 *       Safe to poll frequently from your frontend.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance retrieved successfully (always fetches fresh from Polygon)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: string
 *                   description: USDC.e balance in human-readable format
 *                   example: "100.50"
 *                 balanceRaw:
 *                   type: string
 *                   description: USDC.e balance in smallest unit (6 decimals)
 *                 proxyWallet:
 *                   type: string
 *                   description: User's proxy wallet address
 *                 hasUSDCE:
 *                   type: boolean
 *                   description: Whether user has USDC.e (bridged) that needs to be swapped
 *                 usdceBalance:
 *                   type: string
 *                   description: USDC.e balance if any exists
 *                   example: "2.0"
 *                 needsSwap:
 *                   type: boolean
 *                   description: Flag indicating if swap is needed (true if hasUSDCE is true)
 *                 error:
 *                   type: string
 *                   description: Optional error message if balance couldn't be fetched (network issues)
 *       401:
 *         description: Authentication required
 */
router.get('/balance', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Fetch balance directly from Polygon blockchain (no caching)
    // This ensures the frontend always gets the most up-to-date balance
    const balance = await getUserBalance(userAddress);
    
    // Check if user has USDC.e that needs to be swapped
    const { checkUSDCEBalance } = await import('../services/usdc-swap');
    const usdceCheck = await checkUSDCEBalance(userAddress);
    
    // If there's an error fetching balance, return 200 with error message
    // (balance will be "0" but error field indicates network issue)
    if (balance.error) {
      res.status(200).json({
        ...balance,
        hasUSDCE: usdceCheck.hasUSDCE,
        usdceBalance: usdceCheck.balance,
        needsSwap: usdceCheck.hasUSDCE,
      });
      return;
    }
    
    // Add USDC.e info to response if user has any
    res.json({
      ...balance,
      hasUSDCE: usdceCheck.hasUSDCE,
      usdceBalance: usdceCheck.balance,
      needsSwap: usdceCheck.hasUSDCE, // Flag to indicate swap is needed
    });
  } catch (error) {
    console.error('Error getting balance:', error);
    // This shouldn't happen now, but keep as fallback
    res.status(200).json({
      balance: '0',
      balanceRaw: '0',
      proxyWallet: null,
      error: 'Failed to get balance. Please try again later.',
    });
  }
});

/**
 * @swagger
 * /deposit/status/{depositId}:
 *   get:
 *     summary: Get deposit status
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: depositId
 *         required: true
 *         schema:
 *           type: string
 *         description: Deposit ID
 *     responses:
 *       200:
 *         description: Deposit status retrieved successfully
 *       404:
 *         description: Deposit not found
 *       401:
 *         description: Authentication required
 */
router.get('/status/:depositId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { depositId } = req.params;
    const status = await getDepositStatus(depositId);
    res.json(status);
  } catch (error) {
    console.error('Error getting deposit status:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get deposit status';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/history:
 *   get:
 *     summary: Get user's deposit history
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deposit history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deposits:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       status:
 *                         type: string
 *                       sourceCurrency:
 *                         type: string
 *                       sourceAmount:
 *                         type: string
 *                       targetAmount:
 *                         type: string
 *                       transactionHash:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Authentication required
 */
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const deposits = await getUserDeposits(userAddress);
    res.json({ deposits });
  } catch (error) {
    console.error('Error getting deposit history:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get deposit history';
    const statusCode = errorMessage.includes('not found') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/callback:
 *   post:
 *     summary: Onramper webhook callback (handles deposit completion)
 *     tags: [Deposit]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               depositId:
 *                 type: string
 *               onramperOrderId:
 *                 type: string
 *               usdcAmount:
 *                 type: string
 *               transactionHash:
 *                 type: string
 *     responses:
 *       200:
 *         description: Deposit callback processed successfully
 *       400:
 *         description: Invalid request
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    // Verify webhook secret (in production, verify signature)
    // TODO: Add webhook signature verification here
    // const webhookSecret = config.deposit.webhookSecret;

    const { depositId, onramperOrderId, usdcAmount, transactionHash } = req.body;

    if (!depositId || !onramperOrderId || !usdcAmount) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const result = await processDepositCallback(
      depositId,
      onramperOrderId,
      usdcAmount,
      transactionHash
    );

    res.json(result);
  } catch (error) {
    console.error('Error processing deposit callback:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process deposit callback',
    });
  }
});

/**
 * @swagger
 * /deposit/callback:
 *   get:
 *     summary: Onramper redirect callback (for user redirect after deposit)
 *     tags: [Deposit]
 *     parameters:
 *       - in: query
 *         name: depositId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Redirect handled
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { depositId } = req.query;

    if (!depositId || typeof depositId !== 'string') {
      res.status(400).json({ error: 'depositId is required' });
      return;
    }

    // Get deposit status
    const status = await getDepositStatus(depositId);

    // Redirect to frontend with deposit status
    const frontendUrl = `${config.app.url}/deposit/status?depositId=${depositId}&status=${status.status}`;
    res.redirect(frontendUrl);
  } catch (error) {
    console.error('Error handling deposit callback:', error);
    // Redirect to frontend error page
    const frontendUrl = `${config.app.url}/deposit/error`;
    res.redirect(frontendUrl);
  }
});

/**
 * @swagger
 * /deposit/swap-usdce:
 *   post:
 *     summary: Swap USDC.e (bridged) to Native USDC for Polymarket trading
 *     description: |
 *       If a user mistakenly deposits USDC.e instead of Native USDC, this endpoint
 *       will automatically swap it to Native USDC using Uniswap V3.
 *       Polymarket requires Native USDC, so this swap is necessary for trading.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: string
 *                 description: Amount of USDC.e to swap (e.g., "2.0"). If not provided, swaps all available USDC.e
 *                 example: "2.0"
 *     responses:
 *       200:
 *         description: Swap initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 txHash:
 *                   type: string
 *                   description: Transaction hash of the swap
 *                 amountIn:
 *                   type: string
 *                   description: Amount of USDC.e swapped
 *                 amountOut:
 *                   type: string
 *                   description: Amount of Native USDC received
 *                 error:
 *                   type: string
 *                   description: Error message if swap failed
 *       401:
 *         description: Authentication required
 */
router.post('/swap-usdce', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { amount } = req.body;

    const { swapUSDCEToNative } = await import('../services/usdc-swap');
    const result = await swapUSDCEToNative(userAddress, amount);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error swapping USDC.e:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to swap USDC.e';
    res.status(500).json({
      success: false,
      amountIn: '0',
      amountOut: '0',
      error: errorMessage,
    });
  }
});

/**
 * @swagger
 * /deposit/check-usdce:
 *   get:
 *     summary: Check if user has USDC.e that needs to be swapped
 *     description: |
 *       Checks if the user's proxy wallet has any USDC.e (bridged) balance.
 *       USDC.e cannot be used directly on Polymarket and must be swapped to Native USDC.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: USDC.e balance check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasUSDCE:
 *                   type: boolean
 *                   description: Whether user has USDC.e balance
 *                 balance:
 *                   type: string
 *                   description: USDC.e balance in human-readable format
 *                 balanceRaw:
 *                   type: string
 *                   description: USDC.e balance in raw format
 *       401:
 *         description: Authentication required
 */
router.get('/check-usdce', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { checkUSDCEBalance } = await import('../services/usdc-swap');
    const result = await checkUSDCEBalance(userAddress);

    res.json(result);
  } catch (error) {
    console.error('Error checking USDC.e balance:', error);
    res.status(500).json({
      hasUSDCE: false,
      balance: '0',
      balanceRaw: '0',
      error: error instanceof Error ? error.message : 'Failed to check USDC.e balance',
    });
  }
});

/**
 * @swagger
 * /deposit/balance-breakdown:
 *   get:
 *     summary: Get detailed USDC balance breakdown showing which token to top up
 *     description: |
 *       Returns separate balances for Native USDC and USDC.e (bridged).
 *       Provides clear recommendation on which token to top up for Polymarket trading.
 *       Polymarket requires Native USDC, so this endpoint helps you know which token to deposit.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balance breakdown retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 safeAddress:
 *                   type: string
 *                   description: Safe wallet (proxy wallet) address
 *                 nativeUSDC:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       description: Native USDC contract address
 *                     balance:
 *                       type: string
 *                       description: Native USDC balance (human-readable)
 *                     balanceRaw:
 *                       type: string
 *                       description: Native USDC balance (raw format)
 *                     isRequired:
 *                       type: boolean
 *                       description: Always true - required for Polymarket
 *                 bridgedUSDCE:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       description: USDC.e contract address
 *                     balance:
 *                       type: string
 *                       description: USDC.e balance (human-readable)
 *                     balanceRaw:
 *                       type: string
 *                       description: USDC.e balance (raw format)
 *                     needsSwap:
 *                       type: boolean
 *                       description: Whether USDC.e needs to be swapped
 *                 totalBalance:
 *                   type: string
 *                   description: Combined balance of both tokens
 *                 recommendation:
 *                   type: object
 *                   properties:
 *                     tokenToTopUp:
 *                       type: string
 *                       enum: [native, bridged, either]
 *                       description: Which token to top up (always "native" for Polymarket)
 *                     reason:
 *                       type: string
 *                       description: Explanation of recommendation
 *                     needsSwap:
 *                       type: boolean
 *                       description: Whether swap is needed
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User or proxy wallet not found
 */
router.get('/balance-breakdown', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { getUserUSDCBalanceBreakdown } = await import('../services/usdc-balance-checker');
    const breakdown = await getUserUSDCBalanceBreakdown(userAddress);

    if (!breakdown) {
      res.status(404).json({ 
        error: 'User or proxy wallet not found. Please create a proxy wallet first.' 
      });
      return;
    }

    res.json(breakdown);
  } catch (error) {
    console.error('Error getting balance breakdown:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get balance breakdown',
    });
  }
});

/**
 * @swagger
 * /deposit/gas-balance:
 *   get:
 *     summary: Get gas balance information for Safe wallet
 *     description: |
 *       Returns MATIC balance (native Polygon token) used for gas fees.
 *       Shows if balance is sufficient for transactions and recommends top-up amount if needed.
 *       Gas for Safe transactions is paid in MATIC, not USDC.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Gas balance information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 relayerAddress:
 *                   type: string
 *                   description: Relayer wallet address (pays for gas fees)
 *                 safeAddress:
 *                   type: string
 *                   description: Same as relayerAddress (kept for backward compatibility)
 *                 gasToken:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [native, erc20]
 *                       description: Type of gas token (currently always "native")
 *                     address:
 *                       type: string
 *                       description: Gas token address (AddressZero for native)
 *                     name:
 *                       type: string
 *                       description: Gas token name
 *                     balance:
 *                       type: string
 *                       description: Gas token balance (human-readable)
 *                     balanceRaw:
 *                       type: string
 *                       description: Gas token balance (raw format)
 *                     isSufficient:
 *                       type: boolean
 *                       description: Whether balance is sufficient for transactions
 *                     estimatedGasCost:
 *                       type: string
 *                       description: Estimated gas cost per trade
 *                 recommendation:
 *                   type: object
 *                   properties:
 *                     needsTopUp:
 *                       type: boolean
 *                       description: Whether top-up is needed
 *                     tokenToTopUp:
 *                       type: string
 *                       description: Token to top up (currently always "MATIC")
 *                     amountToTopUp:
 *                       type: string
 *                       description: Recommended amount to top up
 *                     reason:
 *                       type: string
 *                       description: Explanation of recommendation
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User or proxy wallet not found
 */
router.get('/gas-balance', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { getUserGasBalanceInfo } = await import('../services/gas-balance-checker');
    const gasInfo = await getUserGasBalanceInfo(userAddress);

    if (!gasInfo) {
      res.status(404).json({ 
        error: 'User or proxy wallet not found. Please create a proxy wallet first.' 
      });
      return;
    }

    res.json(gasInfo);
  } catch (error) {
    console.error('Error getting gas balance:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get gas balance',
    });
  }
});

/**
 * @swagger
 * /deposit/supported-assets:
 *   get:
 *     summary: Get all supported assets for deposits
 *     description: |
 *       Returns all supported chains and tokens for deposits and withdrawals.
 *       Each asset includes minimum deposit amounts in USD.
 *       Assets are automatically synced from Polymarket Bridge API and refreshed periodically.
 *     tags: [Deposit]
 *     responses:
 *       200:
 *         description: Supported assets retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 supportedAssets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       chainId:
 *                         type: string
 *                         example: "137"
 *                       chainName:
 *                         type: string
 *                         example: "Polygon"
 *                       token:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: "USD Coin (PoS)"
 *                           symbol:
 *                             type: string
 *                             example: "USDC.e"
 *                           address:
 *                             type: string
 *                             example: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
 *                           decimals:
 *                             type: integer
 *                             example: 6
 *                       minCheckoutUsd:
 *                         type: number
 *                         description: Minimum deposit amount in USD
 *                         example: 2
 */
router.get('/supported-assets', async (_req: Request, res: Response) => {
  try {
    const { getSupportedAssets } = await import('../services/bridge-assets');
    const assets = await getSupportedAssets();
    
    res.json({
      supportedAssets: assets,
      note: 'These are the currently supported chains and assets for deposits and withdrawals.',
    });
  } catch (error) {
    console.error('Error getting supported assets:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get supported assets';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/sync-assets:
 *   post:
 *     summary: Manually sync supported assets from Polymarket Bridge API (Admin)
 *     description: |
 *       Manually triggers a sync of supported assets from Polymarket Bridge API.
 *       This is useful if you need to refresh assets immediately without waiting for the scheduled sync.
 *       Assets are automatically synced every 6 hours, but this endpoint allows manual refresh.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assets synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 synced:
 *                   type: integer
 *                   description: Number of assets synced
 *                 errors:
 *                   type: integer
 *                   description: Number of errors encountered
 *       500:
 *         description: Sync failed
 */
router.post('/sync-assets', authenticateToken, async (_req: AuthRequest, res: Response) => {
  try {
    const { syncSupportedAssets } = await import('../services/bridge-assets');
    const result = await syncSupportedAssets();
    
    res.json({
      success: true,
      synced: result.synced,
      errors: result.errors,
      message: `Synced ${result.synced} assets (${result.errors} errors)`,
    });
  } catch (error) {
    console.error('Error syncing supported assets:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync supported assets';
    res.status(500).json({ 
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * @swagger
 * /deposit/create-addresses:
 *   post:
 *     summary: Create deposit addresses for user's proxy wallet
 *     description: |
 *       Generates unique deposit addresses for bridging assets to Polymarket.
 *       Uses the user's proxy wallet (Safe wallet) address to create deposit addresses.
 *       All deposits are automatically bridged and swapped to USDC.e on Polygon.
 *       USDC.e is credited to the user's proxy wallet for trading.
 *       
 *       **Important:** 
 *       - This endpoint requires authentication (Bearer token in Authorization header)
 *       - No request body parameters needed - user is identified from JWT token
 *       - Always use the proxy wallet address returned in the response
 *       - Do not use the user's original wallet address for deposits
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       description: No request body required - user is identified from JWT token
 *     responses:
 *       200:
 *         description: Deposit addresses created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                   description: User's proxy wallet address (where funds will be deposited)
 *                   example: "0x56687bf447db6ffa42ffe2204a05edaa20f55839"
 *                 depositAddresses:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       chainId:
 *                         type: string
 *                         example: "1"
 *                       chainName:
 *                         type: string
 *                         example: "Ethereum"
 *                       tokenAddress:
 *                         type: string
 *                         example: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
 *                       tokenSymbol:
 *                         type: string
 *                         example: "USDC"
 *                       depositAddress:
 *                         type: string
 *                         description: Unique deposit address for this chain/token combination
 *                         example: "0x1234567890abcdef1234567890abcdef12345678"
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User or proxy wallet not found
 */
router.post('/create-addresses', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { createDepositAddresses } = await import('../services/bridge-deposit');
    const result = await createDepositAddresses(userAddress);

    res.json(result);
  } catch (error) {
    console.error('Error creating deposit addresses:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create deposit addresses';
    const statusCode = errorMessage.includes('not found') ? 404 : errorMessage.includes('proxy wallet') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/direct-address:
 *   get:
 *     summary: Get direct deposit address on Polygon (no bridge needed)
 *     description: |
 *       Returns the proxy wallet address for direct Polygon deposits.
 *       Use this if you're already on Polygon and want to deposit directly.
 *       Funds will appear immediately without waiting for bridge.
 *       
 *       **Recommended for Polygon users:** This is simpler and faster than using the bridge.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Direct deposit address retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 depositAddress:
 *                   type: string
 *                   description: Proxy wallet address on Polygon
 *                   example: "0xc7341f97032a56510720c302003d4b09ce6cfeef"
 *                 network:
 *                   type: string
 *                   description: Network name
 *                   example: "Polygon"
 *                 chainId:
 *                   type: integer
 *                   description: Chain ID
 *                   example: 137
 *                 token:
 *                   type: string
 *                   description: Token symbol to send
 *                   example: "USDC"
 *                 tokenAddress:
 *                   type: string
 *                   description: Token contract address
 *                   example: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"
 *                 instructions:
 *                   type: string
 *                   description: Instructions for deposit
 *                 note:
 *                   type: string
 *                   description: Additional notes
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User or proxy wallet not found
 */
router.get('/direct-address', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get user to retrieve their proxy wallet address
    const { getUserByAddress } = await import('../services/auth');
    const user = await getUserByAddress(userAddress);

    if (!user) {
      res.status(404).json({ 
        error: `User not found: ${userAddress}` 
      });
      return;
    }

    if (!user.proxyWallet) {
      res.status(404).json({ 
        error: `User ${userAddress} does not have a proxy wallet. Please complete signup first.` 
      });
      return;
    }

    res.json({
      depositAddress: user.proxyWallet,
      network: "Polygon",
      chainId: 137,
      token: "USDC",  // Native USDC on Polygon
      tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Native USDC
      instructions: "Send Native USDC directly to this address on Polygon. Your funds will appear immediately. No bridge is needed.",
      note: "This is a direct deposit. Use this if you're already on Polygon. For Ethereum deposits, use /deposit/create-addresses instead.",
      recommended: true,
    });
  } catch (error) {
    console.error('Error getting direct deposit address:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get direct deposit address';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/deposit-options:
 *   get:
 *     summary: Get all deposit options (direct and bridge)
 *     description: |
 *       Returns both direct deposit (Polygon) and bridge deposit (Ethereum) options.
 *       Users can choose which method to use based on which network they're on.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deposit options retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 options:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [direct, bridge]
 *                         description: Deposit type
 *                       depositAddress:
 *                         type: string
 *                         description: Address to send funds to
 *                       network:
 *                         type: string
 *                         description: Network name
 *                       chainId:
 *                         type: integer
 *                         description: Chain ID
 *                       token:
 *                         type: string
 *                         description: Token symbol
 *                       instructions:
 *                         type: string
 *                         description: Instructions
 *                       recommended:
 *                         type: boolean
 *                         description: Whether this option is recommended
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User or proxy wallet not found
 */
router.get('/deposit-options', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get user to retrieve their proxy wallet address
    const { getUserByAddress } = await import('../services/auth');
    const user = await getUserByAddress(userAddress);

    if (!user || !user.proxyWallet) {
      res.status(404).json({ 
        error: 'Proxy wallet not found. Please complete signup first.' 
      });
      return;
    }

    // Get bridge addresses
    let bridgeAddresses = null;
    try {
      const { createDepositAddresses } = await import('../services/bridge-deposit');
      bridgeAddresses = await createDepositAddresses(userAddress);
    } catch (error) {
      console.warn('Could not get bridge addresses:', error);
    }

    const options = [
      {
        type: "direct",
        depositAddress: user.proxyWallet,
        network: "Polygon",
        chainId: 137,
        token: "USDC",
        tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        instructions: "Send Native USDC directly to this address on Polygon. Funds appear immediately. No bridge needed.",
        recommended: true,
        speed: "Instant",
      },
      {
        type: "bridge",
        depositAddress: bridgeAddresses?.address || null,
        depositAddresses: bridgeAddresses?.depositAddresses || [],
        network: "Ethereum",
        chainId: 1,
        token: "USDC",
        instructions: "Send USDC from Ethereum mainnet to the deposit address. Bridge takes 5-15 minutes. Funds appear as USDC.e.",
        recommended: false,
        speed: "5-15 minutes",
        note: bridgeAddresses?.note || undefined,
      },
    ];

    res.json({ options });
  } catch (error) {
    console.error('Error getting deposit options:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get deposit options';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/history:
 *   get:
 *     summary: Get user's complete deposit history (USDC.e only)
 *     description: |
 *       Returns all USDC.e deposits for the user's proxy wallet.
 *       The endpoint automatically syncs new deposits from the blockchain to the database
 *       for record keeping. Only USDC.e (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174) is tracked,
 *       which matches the token used for balance checks.
 *       
 *       Features:
 *       - Automatically syncs new on-chain deposits to database
 *       - Uses incremental scanning (only scans new blocks since last check)
 *       - Returns deposits from database (includes all synced on-chain deposits)
 *       - Provides statistics (total, completed, pending, total amount)
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deposit history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deposits:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       depositId:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [pending, processing, bridging, completed, failed]
 *                       sourceChain:
 *                         type: string
 *                       tokenSymbol:
 *                         type: string
 *                         example: "USDC.e"
 *                       amount:
 *                         type: string
 *                       targetAmount:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       transactionHash:
 *                         type: string
 *                       blockNumber:
 *                         type: number
 *                       isHistorical:
 *                         type: boolean
 *                       isBridgedUSDCE:
 *                         type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     completed:
 *                       type: number
 *                     pending:
 *                       type: number
 *                     totalAmount:
 *                       type: string
 *       401:
 *         description: Authentication required
 */
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get complete deposit history (always syncs new deposits from blockchain to database)
    const { getCompleteDepositHistory } = await import('../services/deposit-history-scanner');
    const history = await getCompleteDepositHistory(userAddress, true); // autoSync = true

    res.json(history);
  } catch (error) {
    console.error('Error getting deposit history:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get deposit history';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/track/{depositId}:
 *   get:
 *     summary: Track a specific deposit by ID
 *     description: |
 *       Returns detailed tracking information for a specific deposit.
 *       This will check both source chain and destination to determine current status.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: depositId
 *         required: true
 *         schema:
 *           type: string
 *         description: Deposit ID
 *     responses:
 *       200:
 *         description: Deposit tracking info retrieved successfully
 *       404:
 *         description: Deposit not found
 *       401:
 *         description: Authentication required
 */
router.get('/track/:depositId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { depositId } = req.params;
    const userAddress = req.userAddress;
    
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { getDepositTrackingInfo } = await import('../services/deposit-tracker');
    const trackingInfo = await getDepositTrackingInfo(depositId);
    
    if (!trackingInfo) {
      res.status(404).json({ error: 'Deposit not found' });
      return;
    }
    
    // Verify deposit belongs to user
    if (trackingInfo.userAddress.toLowerCase() !== userAddress.toLowerCase()) {
      res.status(403).json({ error: 'Deposit does not belong to this user' });
      return;
    }

    res.json(trackingInfo);
  } catch (error) {
    console.error('Error tracking deposit:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to track deposit';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/create-record:
 *   post:
 *     summary: Create a deposit record for tracking (after user sends funds)
 *     description: |
 *       Creates a deposit record when a user initiates a deposit.
 *       Call this after the user sends funds to the deposit address.
 *       The system will automatically track the deposit through the bridge process.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceChain
 *               - sourceChainId
 *               - tokenAddress
 *               - tokenSymbol
 *               - amount
 *               - amountRaw
 *               - sourceTxHash
 *             properties:
 *               sourceChain:
 *                 type: string
 *                 example: "Ethereum"
 *               sourceChainId:
 *                 type: string
 *                 example: "1"
 *               tokenAddress:
 *                 type: string
 *                 example: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
 *               tokenSymbol:
 *                 type: string
 *                 example: "USDC"
 *               amount:
 *                 type: string
 *                 example: "100.0"
 *               amountRaw:
 *                 type: string
 *                 example: "100000000"
 *               sourceTxHash:
 *                 type: string
 *                 example: "0x..."
 *               depositAddress:
 *                 type: string
 *                 description: Optional deposit address (will be fetched if not provided)
 *     responses:
 *       200:
 *         description: Deposit record created successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Authentication required
 */
/**
 * @swagger
 * /deposit/sync-historical:
 *   post:
 *     summary: Sync historical deposits from blockchain
 *     description: |
 *       Scans the blockchain for historical deposits to the user's proxy wallet
 *       and creates deposit records for them. This allows users to see their complete
 *       deposit history including deposits made before tracking was implemented.
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Historical deposits synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 synced:
 *                   type: number
 *                   description: Number of new deposits synced
 *                 skipped:
 *                   type: number
 *                   description: Number of deposits that already existed
 *                 errors:
 *                   type: number
 *                   description: Number of errors encountered
 *       401:
 *         description: Authentication required
 */
router.post('/sync-historical', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { syncHistoricalDeposits } = await import('../services/deposit-history-scanner');
    const result = await syncHistoricalDeposits(userAddress);

    res.json({
      success: true,
      ...result,
      message: `Synced ${result.synced} new deposits, skipped ${result.skipped} existing deposits`,
    });
  } catch (error) {
    console.error('Error syncing historical deposits:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to sync historical deposits';
    res.status(500).json({ error: errorMessage });
  }
});

router.post('/create-record', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const {
      sourceChain,
      sourceChainId,
      tokenAddress,
      tokenSymbol,
      amount,
      amountRaw,
      sourceTxHash,
      depositAddress,
    } = req.body;

    if (!sourceChain || !sourceChainId || !tokenAddress || !tokenSymbol || !amount || !amountRaw || !sourceTxHash) {
      res.status(400).json({ 
        error: 'Missing required fields: sourceChain, sourceChainId, tokenAddress, tokenSymbol, amount, amountRaw, sourceTxHash' 
      });
      return;
    }

    const { createDepositRecord } = await import('../services/deposit-tracker');
    const depositId = await createDepositRecord(
      userAddress,
      sourceChain,
      sourceChainId,
      tokenAddress,
      tokenSymbol,
      amount,
      amountRaw,
      sourceTxHash,
      depositAddress
    );

    res.json({
      success: true,
      depositId,
      message: 'Deposit record created. Tracking will begin automatically.',
    });
  } catch (error) {
    console.error('Error creating deposit record:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create deposit record';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /deposit/unified:
 *   get:
 *     summary: Get unified deposit information with all options and clear instructions
 *     description: |
 *       Returns all deposit options (direct and bridge) with clear instructions to help users
 *       avoid confusion. This endpoint consolidates deposit addresses, supported assets, and
 *       provides detailed guidance on which method to use based on the user's network.
 *       
 *       **Key Features:**
 *       - Shows all deposit options (direct + bridge)
 *       - Clear warnings about common mistakes
 *       - Network-specific instructions
 *       - Supported assets reference
 *       - Recommendations based on user's likely network
 *       
 *       **Prevents Common Mistakes:**
 *       - Clearly shows which network each address is on
 *       - Warns against sending from wrong network
 *       - Explains the difference between direct and bridge deposits
 *       - Provides step-by-step instructions for each method
 *     tags: [Deposit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unified deposit information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userAddress:
 *                   type: string
 *                   description: User's Ethereum address
 *                 proxyWallet:
 *                   type: string
 *                   description: User's proxy wallet address (destination for all deposits)
 *                 proxyWalletNetwork:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "Polygon"
 *                     chainId:
 *                       type: integer
 *                       example: 137
 *                     explorerUrl:
 *                       type: string
 *                 options:
 *                   type: array
 *                   description: All available deposit options
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [direct, bridge]
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       recommended:
 *                         type: boolean
 *                       network:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           chainId:
 *                             type: integer
 *                           displayName:
 *                             type: string
 *                       depositAddress:
 *                         type: string
 *                       token:
 *                         type: object
 *                         properties:
 *                           symbol:
 *                             type: string
 *                           address:
 *                             type: string
 *                           name:
 *                             type: string
 *                           decimals:
 *                             type: integer
 *                       speed:
 *                         type: string
 *                       fees:
 *                         type: string
 *                       instructions:
 *                         type: array
 *                         items:
 *                           type: string
 *                       warnings:
 *                         type: array
 *                         items:
 *                           type: string
 *                       example:
 *                         type: object
 *                       commonMistakes:
 *                         type: array
 *                         items:
 *                           type: string
 *                       explorerUrl:
 *                         type: string
 *                 supportedAssets:
 *                   type: array
 *                   description: All supported assets for deposits
 *                 recommendations:
 *                   type: object
 *                   properties:
 *                     forPolygonUsers:
 *                       type: string
 *                     forEthereumUsers:
 *                       type: string
 *                     forOtherChainUsers:
 *                       type: string
 *                 importantNotes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 helpText:
 *                   type: string
 *       401:
 *         description: Authentication required
 *       404:
 *         description: User or proxy wallet not found
 */
router.get('/unified', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { getUnifiedDepositOptions } = await import('../services/deposit-options');
    const options = await getUnifiedDepositOptions(userAddress);

    res.json(options);
  } catch (error) {
    console.error('Error getting unified deposit options:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get unified deposit options';
    const statusCode = errorMessage.includes('not found') || errorMessage.includes('does not have a proxy wallet') ? 404 : 500;
    res.status(statusCode).json({ error: errorMessage });
  }
});

export default router;

