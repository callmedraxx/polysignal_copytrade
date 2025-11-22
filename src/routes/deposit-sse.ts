import { Router, Response } from "express";
import { logger } from "../utils/logger";
import { prisma } from "../config/database";
import { trackDeposit } from "../services/deposit-tracker";
import { config } from "../config/env";
import jwt from "jsonwebtoken";

const router: Router = Router();

// Store active SSE connections
const activeConnections = new Map<string, Set<Response>>();

/**
 * Server-Sent Events endpoint for real-time deposit tracking
 * 
 * Usage:
 * GET /api/deposit/track-sse/:depositId
 * 
 * Client connects and receives updates whenever deposit status changes
 */
/**
 * SSE endpoint for tracking specific deposit
 * Supports authentication via:
 * - Authorization header (Bearer token) - preferred
 * - token query parameter - fallback for EventSource compatibility
 */
router.get("/track-sse/:depositId", async (req: any, res: Response) => {
  const depositId = req.params.depositId;
  
  // Support authentication via Authorization header or query parameter
  let userAddress: string | undefined;
  
  // Try Authorization header first
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace("Bearer ", "");
      const decoded = jwt.verify(token, config.jwt.secret) as { address: string; userId: string };
      userAddress = decoded.address;
    } catch (error) {
      // Invalid token in header, try query param
    }
  }
  
  // Fallback to query parameter (for EventSource compatibility)
  if (!userAddress && req.query.token) {
    try {
      const token = req.query.token as string;
      const decoded = jwt.verify(token, config.jwt.secret) as { address: string; userId: string };
      userAddress = decoded.address;
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  }
  
  if (!userAddress) {
    res.status(401).json({ error: "Authentication required. Provide token in Authorization header or ?token= query parameter" });
    return;
  }

  // Verify deposit belongs to user
  try {
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
      include: { user: true },
    });

    if (!deposit) {
      res.status(404).json({ error: "Deposit not found" });
      return;
    }

    if (deposit.user.address.toLowerCase() !== userAddress.toLowerCase()) {
      res.status(403).json({ error: "Deposit does not belong to this user" });
      return;
    }
  } catch (error) {
    logger.error("Error verifying deposit ownership", {
      depositId,
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Cache-Control");

  // Add connection to active connections
  if (!activeConnections.has(depositId)) {
    activeConnections.set(depositId, new Set());
  }
  activeConnections.get(depositId)!.add(res);

  logger.info("SSE connection established", {
    depositId,
    userAddress,
    activeConnections: activeConnections.get(depositId)!.size,
  });

  // Send initial status
  try {
    const trackingInfo = await trackDeposit(depositId);
    res.write(`data: ${JSON.stringify(trackingInfo)}\n\n`);
  } catch (error) {
    logger.error("Error sending initial deposit status", {
      depositId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // Handle client disconnect
  req.on("close", () => {
    activeConnections.get(depositId)?.delete(res);
    
    // Clean up if no more connections
    if (activeConnections.get(depositId)?.size === 0) {
      activeConnections.delete(depositId);
    }
    
    logger.info("SSE connection closed", {
      depositId,
      userAddress,
      remainingConnections: activeConnections.get(depositId)?.size || 0,
    });
  });

  // Keep connection alive with ping
  const pingInterval = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch (error) {
      // Connection closed, stop pinging
      clearInterval(pingInterval);
      activeConnections.get(depositId)?.delete(res);
    }
  }, 30000); // Ping every 30 seconds

  // Stop pinging when connection closes
  req.on("close", () => {
    clearInterval(pingInterval);
  });
});

/**
 * Broadcast deposit update to all connected clients
 * Called by the deposit tracker worker when status changes
 */
export function broadcastDepositUpdate(depositId: string, trackingInfo: any) {
  const connections = activeConnections.get(depositId);
  
  if (!connections || connections.size === 0) {
    return;
  }

  const message = `data: ${JSON.stringify(trackingInfo)}\n\n`;
  const deadConnections: Response[] = [];

  connections.forEach((res) => {
    try {
      res.write(message);
    } catch (error) {
      // Connection is dead, mark for removal
      deadConnections.push(res);
    }
  });

  // Remove dead connections
  deadConnections.forEach((res) => {
    connections.delete(res);
  });

  // Clean up if no more connections
  if (connections.size === 0) {
    activeConnections.delete(depositId);
  }

  logger.debug("Broadcast deposit update via SSE", {
    depositId,
    connectedClients: connections.size,
    status: trackingInfo.status,
  });
}

/**
 * SSE endpoint for all deposits (user-level tracking)
 * Sends updates whenever any deposit for the user changes
 */
router.get("/track-sse-all", async (req: any, res: Response) => {
  // Support authentication via Authorization header or query parameter
  let userAddress: string | undefined;
  
  // Try Authorization header first
  if (req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace("Bearer ", "");
      const decoded = jwt.verify(token, config.jwt.secret) as { address: string; userId: string };
      userAddress = decoded.address;
    } catch (error) {
      // Invalid token in header, try query param
    }
  }
  
  // Fallback to query parameter (for EventSource compatibility)
  if (!userAddress && req.query.token) {
    try {
      const token = req.query.token as string;
      const decoded = jwt.verify(token, config.jwt.secret) as { address: string; userId: string };
      userAddress = decoded.address;
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
  }
  
  if (!userAddress) {
    res.status(401).json({ error: "Authentication required. Provide token in Authorization header or ?token= query parameter" });
    return;
  }

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Cache-Control");

  // Create a unique connection ID
  const connectionId = `user-${userAddress}-${Date.now()}`;
  
  if (!activeConnections.has(connectionId)) {
    activeConnections.set(connectionId, new Set());
  }
  activeConnections.get(connectionId)!.add(res);

  logger.info("SSE connection established for all deposits", {
    userAddress,
    connectionId,
  });

  // Send initial status for all pending deposits
  try {
    const user = await prisma.user.findUnique({
      where: { address: userAddress.toLowerCase() },
      include: { deposits: true },
    });

    if (user) {
      const pendingDeposits = user.deposits.filter(
        (d) => ["pending", "processing", "bridging"].includes(d.status)
      );

      for (const deposit of pendingDeposits) {
        try {
          const trackingInfo = await trackDeposit(deposit.id);
          res.write(`event: deposit-update\ndata: ${JSON.stringify(trackingInfo)}\n\n`);
        } catch (error) {
          // Skip errors for individual deposits
        }
      }
    }
  } catch (error) {
    logger.error("Error sending initial deposit statuses", {
      userAddress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // Handle client disconnect
  req.on("close", () => {
    activeConnections.get(connectionId)?.delete(res);
    
    if (activeConnections.get(connectionId)?.size === 0) {
      activeConnections.delete(connectionId);
    }
    
    logger.info("SSE connection closed for all deposits", {
      userAddress,
      connectionId,
    });
  });

  // Keep connection alive with ping
  const pingInterval = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch (error) {
      clearInterval(pingInterval);
      activeConnections.get(connectionId)?.delete(res);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(pingInterval);
  });
});

export default router;

