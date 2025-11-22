import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getClientIp } from '../utils/user-logger';

/**
 * Middleware to log all authenticated API requests
 * Should be used after authenticateToken middleware
 */
export function logUserActivity(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  if (req.userAddress && req.userLogger) {
    const method = req.method;
    const endpoint = req.path;
    const ipAddress = getClientIp(req);
    
    // Update IP address in logger if not already set
    if (ipAddress && ipAddress !== 'unknown') {
      req.userLogger.setIpAddress(ipAddress);
    }
    
    // Log the API request
    req.userLogger.apiRequest(method, endpoint, {
      query: req.query,
      body: sanitizeRequestBody(req.body),
    });
  }
  
  next();
}

/**
 * Sanitize request body to remove sensitive information before logging
 */
function sanitizeRequestBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'privateKey', 'mnemonic', 'secret', 'signature', 'token'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

/**
 * Error logging middleware
 * Should be used as error handler
 */
export function logUserError(
  error: Error,
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  if (req.userAddress && req.userLogger) {
    const method = req.method;
    const endpoint = req.path;
    
    req.userLogger.apiError(method, endpoint, error, {
      query: req.query,
      body: sanitizeRequestBody(req.body),
    });
  }
  
  next(error);
}

