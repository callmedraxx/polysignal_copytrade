import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { ProxyDataUsage } from '../utils/proxy-data-tracker';

/**
 * Save proxy data usage to database for an executed order
 */
export async function saveProxyDataUsage(
  orderId: string,
  proxyType: string,
  dataUsage: ProxyDataUsage
): Promise<void> {
  try {
    // Check if proxyDataUsage model exists (may not be in schema)
    if (!('proxyDataUsage' in prisma)) {
      logger.debug('ProxyDataUsage model not available, skipping save');
      return;
    }
    await (prisma as any).proxyDataUsage.create({
      data: {
        orderId,
        proxyType,
        dataSentBytes: BigInt(dataUsage.dataSentBytes),
        dataReceivedBytes: BigInt(dataUsage.dataReceivedBytes),
        dataSentGB: dataUsage.dataSentGB,
        dataReceivedGB: dataUsage.dataReceivedGB,
        totalDataGB: dataUsage.totalDataGB,
      },
    });
    
    logger.info('Proxy data usage saved', {
      orderId,
      proxyType,
      totalDataGB: dataUsage.totalDataGB,
    });
  } catch (error) {
    // If orderId already exists, update instead
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      try {
        await (prisma as any).proxyDataUsage.update({
          where: { orderId },
          data: {
            proxyType,
            dataSentBytes: BigInt(dataUsage.dataSentBytes),
            dataReceivedBytes: BigInt(dataUsage.dataReceivedBytes),
            dataSentGB: dataUsage.dataSentGB,
            dataReceivedGB: dataUsage.dataReceivedGB,
            totalDataGB: dataUsage.totalDataGB,
          },
        });
        
        logger.info('Proxy data usage updated', {
          orderId,
          proxyType,
          totalDataGB: dataUsage.totalDataGB,
        });
      } catch (updateError) {
        logger.error('Failed to update proxy data usage', {
          orderId,
          error: updateError instanceof Error ? updateError.message : 'Unknown error',
        });
      }
    } else {
      logger.error('Failed to save proxy data usage', {
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Get proxy data usage for an order
 */
export async function getProxyDataUsage(orderId: string) {
  if (!('proxyDataUsage' in prisma)) {
    return null;
  }
  return await (prisma as any).proxyDataUsage.findUnique({
    where: { orderId },
  });
}

/**
 * Get total proxy data usage by proxy type
 */
export async function getTotalProxyDataUsage(proxyType?: string) {
  if (!('proxyDataUsage' in prisma)) {
    return {
      totalOrders: 0,
      totalDataSentGB: 0,
      totalDataReceivedGB: 0,
      totalDataGB: 0,
      totalDataSentBytes: '0',
      totalDataReceivedBytes: '0',
    };
  }
  const where = proxyType ? { proxyType } : {};
  
  const result = await (prisma as any).proxyDataUsage.aggregate({
    where,
    _sum: {
      dataSentBytes: true,
      dataReceivedBytes: true,
      dataSentGB: true,
      dataReceivedGB: true,
      totalDataGB: true,
    },
    _count: {
      id: true,
    },
  });
  
  return {
    totalOrders: result._count.id,
    totalDataSentGB: result._sum.dataSentGB || 0,
    totalDataReceivedGB: result._sum.dataReceivedGB || 0,
    totalDataGB: result._sum.totalDataGB || 0,
    totalDataSentBytes: result._sum.dataSentBytes?.toString() || '0',
    totalDataReceivedBytes: result._sum.dataReceivedBytes?.toString() || '0',
  };
}

