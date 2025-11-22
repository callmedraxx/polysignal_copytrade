import fs from 'fs';
import path from 'path';

const USER_LOGS_DIR = path.join(process.cwd(), 'logs', 'users');

// Ensure user logs directory exists
if (!fs.existsSync(USER_LOGS_DIR)) {
  fs.mkdirSync(USER_LOGS_DIR, { recursive: true });
}

export interface UserLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  category: string;
  message: string;
  data?: any;
  ipAddress?: string;
  userId?: string;
  userAddress?: string;
}

/**
 * Get the log file path for a user
 */
function getUserLogFile(userIdOrAddress: string): string {
  // Use user ID or address as filename (sanitize for filesystem)
  const sanitized = userIdOrAddress.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return path.join(USER_LOGS_DIR, `${sanitized}.log`);
}

/**
 * Format log entry as a readable string
 */
function formatLogEntry(entry: UserLogEntry): string {
  const timestamp = entry.timestamp;
  const level = entry.level.padEnd(7);
  const category = entry.category.padEnd(20);
  const ipInfo = entry.ipAddress ? `[IP: ${entry.ipAddress}]` : '';
  const userInfo = entry.userId ? `[UserID: ${entry.userId}]` : '';
  const addressInfo = entry.userAddress ? `[Address: ${entry.userAddress}]` : '';
  
  let logLine = `${timestamp} | ${level} | ${category} | ${entry.message}`;
  
  if (ipInfo || userInfo || addressInfo) {
    logLine += ` ${ipInfo} ${userInfo} ${addressInfo}`.trim();
  }
  
  if (entry.data) {
    const dataStr = typeof entry.data === 'string' 
      ? entry.data 
      : JSON.stringify(entry.data, null, 2);
    logLine += `\n  Data: ${dataStr}`;
  }
  
  return logLine;
}

/**
 * Write log entry to user's log file
 */
function writeUserLog(userIdOrAddress: string, entry: UserLogEntry): void {
  try {
    const logFile = getUserLogFile(userIdOrAddress);
    const logLine = formatLogEntry(entry);
    fs.appendFileSync(logFile, logLine + '\n\n');
  } catch (error) {
    // Fallback to console if file write fails
    console.error(`Failed to write to user log file for ${userIdOrAddress}:`, error);
    console.log(formatLogEntry(entry));
  }
}

/**
 * User Logger - logs all activities for a specific user
 */
export class UserLogger {
  private userIdOrAddress: string;
  private ipAddress?: string;

  constructor(userIdOrAddress: string, ipAddress?: string) {
    this.userIdOrAddress = userIdOrAddress;
    this.ipAddress = ipAddress;
  }

  /**
   * Set IP address for subsequent logs
   */
  setIpAddress(ipAddress: string): void {
    this.ipAddress = ipAddress;
  }

  /**
   * Log an info message
   */
  info(category: string, message: string, data?: any): void {
    writeUserLog(this.userIdOrAddress, {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category,
      message,
      data,
      ipAddress: this.ipAddress,
      userAddress: this.userIdOrAddress.startsWith('0x') ? this.userIdOrAddress : undefined,
    });
  }

  /**
   * Log a success message
   */
  success(category: string, message: string, data?: any): void {
    writeUserLog(this.userIdOrAddress, {
      timestamp: new Date().toISOString(),
      level: 'SUCCESS',
      category,
      message,
      data,
      ipAddress: this.ipAddress,
      userAddress: this.userIdOrAddress.startsWith('0x') ? this.userIdOrAddress : undefined,
    });
  }

  /**
   * Log a warning message
   */
  warn(category: string, message: string, data?: any): void {
    writeUserLog(this.userIdOrAddress, {
      timestamp: new Date().toISOString(),
      level: 'WARN',
      category,
      message,
      data,
      ipAddress: this.ipAddress,
      userAddress: this.userIdOrAddress.startsWith('0x') ? this.userIdOrAddress : undefined,
    });
  }

  /**
   * Log an error message
   */
  error(category: string, message: string, error?: Error | any, data?: any): void {
    const errorData = {
      ...data,
      error: error instanceof Error 
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : error,
    };

    writeUserLog(this.userIdOrAddress, {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      category,
      message,
      data: errorData,
      ipAddress: this.ipAddress,
      userAddress: this.userIdOrAddress.startsWith('0x') ? this.userIdOrAddress : undefined,
    });
  }

  // Convenience methods for common events

  /**
   * Log user signup
   */
  signup(userId: string, data?: any): void {
    this.success('AUTH', 'User signed up', { userId, ...data });
  }

  /**
   * Log user login
   */
  login(userId: string, data?: any): void {
    this.success('AUTH', 'User logged in', { userId, ...data });
  }

  /**
   * Log Safe wallet deployment
   */
  safeDeployment(safeAddress: string, txHash: string, data?: any): void {
    this.success('SAFE_DEPLOYMENT', 'Safe wallet deployed', {
      safeAddress,
      transactionHash: txHash,
      ...data,
    });
  }

  /**
   * Log Safe deployment error
   */
  safeDeploymentError(error: Error | any, data?: any): void {
    this.error('SAFE_DEPLOYMENT', 'Safe wallet deployment failed', error, data);
  }

  /**
   * Log trade copy event
   */
  tradeCopied(tradeId: string, originalTxHash: string, marketId: string, data?: any): void {
    this.info('TRADE_COPY', 'Trade copied from trader', {
      tradeId,
      originalTxHash,
      marketId,
      ...data,
    });
  }

  /**
   * Log trade execution start
   */
  tradeExecutionStart(tradeId: string, marketId: string, tradeType: string, data?: any): void {
    this.info('TRADE_EXECUTION', 'Trade execution started', {
      tradeId,
      marketId,
      tradeType,
      ...data,
    });
  }

  /**
   * Log trade execution success
   */
  tradeExecutionSuccess(tradeId: string, orderId: string, txHash: string, data?: any): void {
    this.success('TRADE_EXECUTION', 'Trade executed successfully', {
      tradeId,
      orderId,
      transactionHash: txHash,
      ...data,
    });
  }

  /**
   * Log trade execution error
   */
  tradeExecutionError(tradeId: string, error: Error | any, data?: any): void {
    this.error('TRADE_EXECUTION', 'Trade execution failed', error, {
      tradeId,
      ...data,
    });
  }

  /**
   * Log deposit initiation
   */
  depositInitiated(depositId: string, amount: string, currency: string, data?: any): void {
    this.info('DEPOSIT', 'Deposit initiated', {
      depositId,
      amount,
      currency,
      ...data,
    });
  }

  /**
   * Log deposit completion
   */
  depositCompleted(depositId: string, txHash: string, amount: string, data?: any): void {
    this.success('DEPOSIT', 'Deposit completed', {
      depositId,
      transactionHash: txHash,
      amount,
      ...data,
    });
  }

  /**
   * Log deposit error
   */
  depositError(depositId: string, error: Error | any, data?: any): void {
    this.error('DEPOSIT', 'Deposit failed', error, {
      depositId,
      ...data,
    });
  }

  /**
   * Log config creation
   */
  configCreated(configId: string, configType: string, data?: any): void {
    this.info('CONFIG', `Copy ${configType} config created`, {
      configId,
      configType,
      ...data,
    });
  }

  /**
   * Log config update
   */
  configUpdated(configId: string, configType: string, changes: any): void {
    this.info('CONFIG', `Copy ${configType} config updated`, {
      configId,
      configType,
      changes,
    });
  }

  /**
   * Log API request
   */
  apiRequest(method: string, endpoint: string, data?: any): void {
    this.info('API_REQUEST', `${method} ${endpoint}`, data);
  }

  /**
   * Log API error
   */
  apiError(method: string, endpoint: string, error: Error | any, data?: any): void {
    this.error('API_ERROR', `${method} ${endpoint}`, error, data);
  }
}

/**
 * Get user logger instance
 * @param userIdOrAddress User ID or wallet address
 * @param ipAddress Optional IP address
 */
export function getUserLogger(userIdOrAddress: string, ipAddress?: string): UserLogger {
  return new UserLogger(userIdOrAddress, ipAddress);
}

/**
 * Helper to get client IP address from request
 */
export function getClientIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

