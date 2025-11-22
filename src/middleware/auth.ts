import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { getUserLogger, getClientIp, UserLogger } from '../utils/user-logger';

export interface AuthRequest extends Request {
  userId?: string;
  userAddress?: string;
  userLogger?: UserLogger;
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user info to request
 */
export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      address: string;
    };

    req.userId = decoded.userId;
    req.userAddress = decoded.address;
    
    // Attach user logger to request for easy access
    const ipAddress = getClientIp(req);
    req.userLogger = getUserLogger(decoded.address, ipAddress);
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
}

