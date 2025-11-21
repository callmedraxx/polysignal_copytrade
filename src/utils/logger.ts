import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'trade-execution.log');
const ERROR_LOG_FILE = path.join(LOG_DIR, 'trade-execution-errors.log');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function writeToFile(filePath: string, message: string) {
  try {
    fs.appendFileSync(filePath, `${formatTimestamp()} ${message}\n`);
  } catch (error) {
    // Fallback to console if file write fails
    console.error(`Failed to write to log file: ${error}`);
    console.log(message);
  }
}

export const logger = {
  info: (message: string, ...args: any[]) => {
    const logMessage = `[INFO] ${message} ${args.length > 0 ? JSON.stringify(args, null, 2) : ''}`;
    console.log(logMessage);
    writeToFile(LOG_FILE, logMessage);
  },

  error: (message: string, ...args: any[]) => {
    const logMessage = `[ERROR] ${message} ${args.length > 0 ? JSON.stringify(args, null, 2) : ''}`;
    console.error(logMessage);
    writeToFile(ERROR_LOG_FILE, logMessage);
    writeToFile(LOG_FILE, logMessage);
  },

  warn: (message: string, ...args: any[]) => {
    const logMessage = `[WARN] ${message} ${args.length > 0 ? JSON.stringify(args, null, 2) : ''}`;
    console.warn(logMessage);
    writeToFile(LOG_FILE, logMessage);
  },

  debug: (message: string, ...args: any[]) => {
    const logMessage = `[DEBUG] ${message} ${args.length > 0 ? JSON.stringify(args, null, 2) : ''}`;
    // Only log debug to file, not console (to reduce terminal noise)
    writeToFile(LOG_FILE, logMessage);
  },

  tenderly: (message: string, data?: any) => {
    const logMessage = `[TENDERLY] ${message} ${data ? JSON.stringify(data, null, 2) : ''}`;
    console.log(`🔍 ${message}`);
    writeToFile(LOG_FILE, logMessage);
  },

  executor: (message: string, data?: any) => {
    const logMessage = `[EXECUTOR] ${message} ${data ? JSON.stringify(data, null, 2) : ''}`;
    console.log(`⚡ ${message}`);
    writeToFile(LOG_FILE, logMessage);
  },
};

