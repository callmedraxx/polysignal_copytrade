import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

/**
 * Migration script to add allocatedUSDCAmount and usedUSDCAmount fields to existing configs
 * Sets allocatedUSDCAmount to $100 (100.0) for existing configs that don't have it
 * Sets usedUSDCAmount to 0 for existing configs
 */
async function addAllocatedUSDCAmount() {
  console.log('🔄 Starting migration: Adding allocatedUSDCAmount to existing configs...');

  try {
    // Get all CopyTradingConfig entries
    const allTradingConfigs = await prisma.copyTradingConfig.findMany({});
    
    // Filter configs that need updating (those without allocatedUSDCAmount or with null/empty values)
    const tradingConfigs = allTradingConfigs.filter(config => 
      !config.allocatedUSDCAmount || 
      config.allocatedUSDCAmount.trim() === '' ||
      parseFloat(config.allocatedUSDCAmount) === 0
    );

    console.log(`📊 Found ${tradingConfigs.length} CopyTradingConfig entries to update (out of ${allTradingConfigs.length} total)`);

    let updatedTradingConfigs = 0;
    for (const config of tradingConfigs) {
      try {
        await prisma.copyTradingConfig.update({
          where: { id: config.id },
          data: {
            allocatedUSDCAmount: '100.0', // Set default to $100
            usedUSDCAmount: config.usedUSDCAmount || '0', // Keep existing or set to 0
          },
        });
        updatedTradingConfigs++;
        console.log(`✅ Updated CopyTradingConfig ${config.id} with allocatedUSDCAmount: $100.0`);
      } catch (error) {
        console.error(`❌ Failed to update CopyTradingConfig ${config.id}:`, error);
      }
    }

    // Get all CopySignalConfig entries
    const allSignalConfigs = await prisma.copySignalConfig.findMany({});
    
    // Filter configs that need updating
    const signalConfigs = allSignalConfigs.filter(config => 
      !config.allocatedUSDCAmount || 
      config.allocatedUSDCAmount.trim() === '' ||
      parseFloat(config.allocatedUSDCAmount) === 0
    );

    console.log(`📊 Found ${signalConfigs.length} CopySignalConfig entries to update (out of ${allSignalConfigs.length} total)`);

    let updatedSignalConfigs = 0;
    for (const config of signalConfigs) {
      try {
        await prisma.copySignalConfig.update({
          where: { id: config.id },
          data: {
            allocatedUSDCAmount: '100.0', // Set default to $100
            usedUSDCAmount: config.usedUSDCAmount || '0', // Keep existing or set to 0
          },
        });
        updatedSignalConfigs++;
        console.log(`✅ Updated CopySignalConfig ${config.id} with allocatedUSDCAmount: $100.0`);
      } catch (error) {
        console.error(`❌ Failed to update CopySignalConfig ${config.id}:`, error);
      }
    }

    console.log(`\n✅ Migration completed!`);
    console.log(`   - Updated ${updatedTradingConfigs} CopyTradingConfig entries`);
    console.log(`   - Updated ${updatedSignalConfigs} CopySignalConfig entries`);
    console.log(`   - All configs now have allocatedUSDCAmount: $100.0`);
    console.log(`   - All configs now have usedUSDCAmount: 0`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
addAllocatedUSDCAmount()
  .then(() => {
    console.log('🎉 Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration script failed:', error);
    process.exit(1);
  });

