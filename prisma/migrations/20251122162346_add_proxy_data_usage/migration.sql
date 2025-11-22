-- Add allocatedUSDCAmount and usedUSDCAmount to CopyTradingConfig
ALTER TABLE "CopyTradingConfig" 
ADD COLUMN IF NOT EXISTS "allocatedUSDCAmount" TEXT,
ADD COLUMN IF NOT EXISTS "usedUSDCAmount" TEXT DEFAULT '0';

-- Set default values for existing rows
UPDATE "CopyTradingConfig" 
SET "allocatedUSDCAmount" = '100.0', "usedUSDCAmount" = '0' 
WHERE "allocatedUSDCAmount" IS NULL OR "allocatedUSDCAmount" = '';

-- Make allocatedUSDCAmount NOT NULL
ALTER TABLE "CopyTradingConfig" 
ALTER COLUMN "allocatedUSDCAmount" SET NOT NULL;

-- Add allocatedUSDCAmount and usedUSDCAmount to CopySignalConfig
ALTER TABLE "CopySignalConfig" 
ADD COLUMN IF NOT EXISTS "allocatedUSDCAmount" TEXT,
ADD COLUMN IF NOT EXISTS "usedUSDCAmount" TEXT DEFAULT '0';

-- Set default values for existing rows
UPDATE "CopySignalConfig" 
SET "allocatedUSDCAmount" = '100.0', "usedUSDCAmount" = '0' 
WHERE "allocatedUSDCAmount" IS NULL OR "allocatedUSDCAmount" = '';

-- Make allocatedUSDCAmount NOT NULL
ALTER TABLE "CopySignalConfig" 
ALTER COLUMN "allocatedUSDCAmount" SET NOT NULL;
