import { Router, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { checkUSDCAllowance, revokeUSDCApproval } from '../services/wallet';
import { redeemPositions, needsRedemption } from '../services/position-redemption';
import { withdrawUSDC, withdrawConditionalToken, getProxyWalletBalances } from '../services/withdrawal';
import { prisma } from '../config/database';
import { ethers } from 'ethers';
import { config } from '../config/env';

const router = Router();

/**
 * @swagger
 * /wallet/usdc/allowance:
 *   get:
 *     summary: Check USDC allowance for Conditional Token Framework (CTF)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current USDC allowance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 safeAddress:
 *                   type: string
 *                   example: "0x1234..."
 *                 allowance:
 *                   type: string
 *                   description: Allowance amount in USDC (6 decimals)
 *                   example: "1000000"
 *                 allowanceFormatted:
 *                   type: string
 *                   description: Formatted allowance amount
 *                   example: "1000000.0"
 *                 isUnlimited:
 *                   type: boolean
 *                   description: Whether allowance is unlimited (MaxUint256)
 *                   example: true
 *       400:
 *         description: User does not have a Safe wallet
 *       401:
 *         description: Authentication required
 */
router.get('/usdc/allowance', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;

    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get user's Safe wallet address
    const user = await prisma.user.findUnique({
      where: { address: userAddress.toLowerCase() },
    });

    if (!user || !user.proxyWallet) {
      res.status(400).json({ 
        error: 'User does not have a Safe wallet. Please create one first.' 
      });
      return;
    }

    const safeAddress = user.proxyWallet;
    
    // Check current allowance
    const allowance = await checkUSDCAllowance(safeAddress);
    const maxUint256 = ethers.constants.MaxUint256;
    const isUnlimited = allowance.gte(maxUint256.div(2)); // Effectively unlimited if >= half of max
    
    res.json({
      safeAddress,
      allowance: allowance.toString(),
      allowanceFormatted: ethers.utils.formatUnits(allowance, 6), // USDC has 6 decimals
      isUnlimited,
    });
  } catch (error) {
    console.error('Error checking USDC allowance:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to check USDC allowance';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /wallet/usdc/revoke:
 *   post:
 *     summary: Revoke USDC approval for Conditional Token Framework (CTF)
 *     description: Sets USDC allowance to 0, preventing CTF from spending USDC from the Safe wallet. Executed gaslessly via Polymarket relayer.
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: USDC approval revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "USDC approval revoked successfully"
 *                 transactionHash:
 *                   type: string
 *                   example: "0x1234..."
 *                 safeAddress:
 *                   type: string
 *                   example: "0x1234..."
 *       400:
 *         description: User does not have a Safe wallet
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to revoke approval
 */
router.post('/usdc/revoke', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;

    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Get user's Safe wallet address
    const user = await prisma.user.findUnique({
      where: { address: userAddress.toLowerCase() },
    });

    if (!user || !user.proxyWallet) {
      res.status(400).json({ 
        error: 'User does not have a Safe wallet. Please create one first.' 
      });
      return;
    }

    const safeAddress = user.proxyWallet;
    
    console.log(`🔒 User ${userAddress} requesting to revoke USDC approval for Safe ${safeAddress}`);
    
    // Revoke approval using user's RelayerClient (gasless)
    const transactionHash = await revokeUSDCApproval(userAddress, safeAddress);
    
    res.json({
      success: true,
      message: 'USDC approval revoked successfully',
      transactionHash,
      safeAddress,
    });
  } catch (error) {
    console.error('Error revoking USDC approval:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to revoke USDC approval';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /wallet/balance:
 *   get:
 *     summary: Get proxy wallet balances (USDC and conditional tokens)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Proxy wallet balances
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usdc:
 *                   type: string
 *                   example: "1000.0"
 *                 conditionalTokens:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tokenId:
 *                         type: string
 *                       balance:
 *                         type: string
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to get balances
 */
router.get('/balance', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;

    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const balances = await getProxyWalletBalances(userAddress);
    res.json(balances);
  } catch (error) {
    console.error('Error getting proxy wallet balances:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to get balances';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /wallet/withdraw/usdc:
 *   post:
 *     summary: Withdraw USDC from proxy wallet to connected wallet
 *     tags: [Wallet]
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
 *                 description: Amount to withdraw in USDC (if not provided, withdraws all)
 *                 example: "100.0"
 *     responses:
 *       200:
 *         description: USDC withdrawal successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 txHash:
 *                   type: string
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to withdraw USDC
 */
router.post('/withdraw/usdc', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;

    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { amount } = req.body;

    const result = await withdrawUSDC(userAddress, amount);

    if (result.success) {
      res.json({
        success: true,
        txHash: result.txHash,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error withdrawing USDC:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to withdraw USDC';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /wallet/withdraw/token:
 *   post:
 *     summary: Withdraw conditional token (ERC1155) from proxy wallet to connected wallet
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tokenId
 *             properties:
 *               tokenId:
 *                 type: string
 *                 description: Conditional token ID to withdraw
 *                 example: "0x1234..."
 *               amount:
 *                 type: string
 *                 description: Amount to withdraw (if not provided, withdraws all)
 *                 example: "100.0"
 *     responses:
 *       200:
 *         description: Token withdrawal successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 txHash:
 *                   type: string
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to withdraw token
 */
router.post('/withdraw/token', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;

    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { tokenId, amount } = req.body;

    if (!tokenId) {
      res.status(400).json({ error: 'tokenId is required' });
      return;
    }

    const result = await withdrawConditionalToken(userAddress, tokenId, amount);

    if (result.success) {
      res.json({
        success: true,
        txHash: result.txHash,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error withdrawing conditional token:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to withdraw token';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * @swagger
 * /wallet/redeem/{tradeId}:
 *   post:
 *     summary: Redeem positions for a copied trade (after market closes)
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tradeId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the copied trade to redeem
 *     responses:
 *       200:
 *         description: Redemption successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 txHash:
 *                   type: string
 *       400:
 *         description: Trade not found or does not belong to user
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Failed to redeem positions
 */
router.post('/redeem/:tradeId', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userAddress = req.userAddress;
    const { tradeId } = req.params;

    if (!userAddress) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify trade belongs to user
    const trade = await prisma.copiedTrade.findUnique({
      where: { id: tradeId },
      include: {
        config: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!trade || !trade.config) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }

    if (trade.config.user.address.toLowerCase() !== userAddress.toLowerCase()) {
      res.status(403).json({ error: 'Trade does not belong to user' });
      return;
    }

    // Check if redemption is needed
    const needsRedemptionCheck = await needsRedemption(tradeId);
    if (!needsRedemptionCheck) {
      res.status(400).json({ 
        error: 'Trade does not need redemption (market may not be closed or already redeemed)' 
      });
      return;
    }

    const result = await redeemPositions(tradeId);

    if (result.success) {
      res.json({
        success: true,
        txHash: result.txHash,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Error redeeming positions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to redeem positions';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;

