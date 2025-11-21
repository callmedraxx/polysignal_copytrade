/**
 * Category Inference System
 * 
 * Maps specific market categories to broader category groups.
 * This allows flexible category matching - e.g., "nba-ind-det-2025-11-17" matches "sports"
 */

// Mapping of specific category patterns to broader categories
const CATEGORY_PATTERNS: Record<string, string[]> = {
  // Sports categories
  sports: [
    'nba', 'nfl', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'baseball', 'hockey',
    'tennis', 'golf', 'boxing', 'mma', 'ufc', 'wrestling', 'cricket', 'rugby', 'f1',
    'formula1', 'racing', 'olympics', 'world-cup', 'euro', 'champions-league', 'premier-league',
    'ncaa', 'college-football', 'college-basketball', 'nascar', 'indycar', 'motogp',
    'esports', 'lol', 'dota', 'csgo', 'valorant', 'overwatch', 'rocket-league',
  ],
  
  // Crypto categories
  crypto: [
    'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'defi', 'nft',
    'blockchain', 'altcoin', 'stablecoin', 'token', 'coin', 'exchange', 'binance',
    'coinbase', 'uniswap', 'defi-protocol', 'yield-farming', 'staking', 'mining',
    'halving', 'fork', 'airdrop', 'ico', 'ido', 'metaverse', 'web3', 'dao',
  ],
  
  // Politics categories
  politics: [
    'election', 'president', 'senate', 'congress', 'house', 'governor', 'mayor',
    'vote', 'voting', 'poll', 'polls', 'primary', 'caucus', 'debate', 'campaign',
    'impeachment', 'supreme-court', 'scotus', 'policy', 'legislation', 'bill',
    'referendum', 'ballot', 'democrat', 'republican', 'independent', 'party',
    'biden', 'trump', 'harris', 'kamala', 'donald', 'joe', 'presidential',
  ],
  
  // Economy categories
  economy: [
    'gdp', 'inflation', 'unemployment', 'jobs', 'employment', 'recession', 'depression',
    'fed', 'federal-reserve', 'interest-rate', 'rate-cut', 'rate-hike', 'monetary',
    'fiscal', 'budget', 'deficit', 'surplus', 'trade', 'tariff', 'import', 'export',
    'dow', 'sp500', 'nasdaq', 'stock-market', 'market', 'stocks', 'shares',
    'earnings', 'revenue', 'profit', 'loss', 'ipo', 'merger', 'acquisition',
  ],
  
  // Technology categories
  technology: [
    'ai', 'artificial-intelligence', 'machine-learning', 'ml', 'deep-learning',
    'chatgpt', 'openai', 'google', 'apple', 'microsoft', 'meta', 'facebook',
    'amazon', 'tesla', 'spacex', 'twitter', 'x', 'social-media', 'tech',
    'software', 'hardware', 'chip', 'semiconductor', 'nvidia', 'amd', 'intel',
    'quantum', 'cloud', 'saas', 'startup', 'unicorn', 'ipo-tech',
  ],
  
  // Entertainment categories
  entertainment: [
    'movie', 'film', 'oscar', 'grammy', 'emmy', 'award', 'box-office', 'netflix',
    'disney', 'marvel', 'dc', 'superhero', 'tv', 'television', 'streaming',
    'music', 'album', 'song', 'artist', 'concert', 'tour', 'festival',
    'game', 'gaming', 'console', 'playstation', 'xbox', 'nintendo', 'switch',
  ],
  
  // Weather/Climate categories
  weather: [
    'hurricane', 'tornado', 'earthquake', 'flood', 'drought', 'wildfire',
    'temperature', 'weather', 'climate', 'global-warming', 'climate-change',
    'storm', 'snow', 'rain', 'blizzard', 'typhoon', 'cyclone',
  ],
  
  // Health/Medical categories
  health: [
    'covid', 'coronavirus', 'pandemic', 'vaccine', 'vaccination', 'fda',
    'drug', 'medicine', 'treatment', 'cure', 'disease', 'illness',
    'health', 'medical', 'hospital', 'doctor', 'nurse', 'patient',
  ],
};

/**
 * Infer broader category from a specific market category string
 * @param category Specific category string (e.g., "nba-ind-det-2025-11-17")
 * @returns Array of inferred broader categories (e.g., ["sports"])
 */
export function inferCategories(category: string | null): string[] {
  if (!category) {
    return [];
  }

  const categoryLower = category.toLowerCase();
  const inferred: Set<string> = new Set();

  // Check each pattern category
  for (const [broadCategory, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      // Check if pattern appears in the category string
      if (categoryLower.includes(pattern.toLowerCase())) {
        inferred.add(broadCategory);
        break; // Found a match for this broad category, move to next
      }
    }
  }

  return Array.from(inferred);
}

/**
 * Get all possible category matches (exact + inferred)
 * @param category Specific category string
 * @returns Array of all matching categories (exact + inferred)
 */
export function getAllCategoryMatches(category: string | null): string[] {
  if (!category) {
    return [];
  }

  const matches: Set<string> = new Set();
  
  // Add exact match
  matches.add(category.toLowerCase());
  
  // Add inferred categories
  const inferred = inferCategories(category);
  inferred.forEach(cat => matches.add(cat.toLowerCase()));
  
  return Array.from(matches);
}

/**
 * Check if a category matches any of the allowed categories (exact or inferred)
 * @param marketCategory The market category to check
 * @param allowedCategories Array of allowed categories (can be specific or broad)
 * @returns True if category matches (exact or inferred)
 */
export function matchesCategory(
  marketCategory: string | null,
  allowedCategories: string[]
): boolean {
  if (!marketCategory || allowedCategories.length === 0) {
    return allowedCategories.length === 0; // Empty allowed = allow all
  }

  const marketCategoryLower = marketCategory.toLowerCase();
  const allowedLower = allowedCategories.map(c => c.toLowerCase());

  // Check exact match
  if (allowedLower.includes(marketCategoryLower)) {
    return true;
  }

  // Check if any inferred category matches any allowed category
  const inferred = inferCategories(marketCategory);
  for (const inferredCat of inferred) {
    if (allowedLower.includes(inferredCat.toLowerCase())) {
      return true;
    }
  }

  // Check if market category contains any allowed category (partial match)
  for (const allowed of allowedLower) {
    if (marketCategoryLower.includes(allowed)) {
      return true;
    }
  }

  // Check if any allowed category contains market category (reverse partial match)
  for (const allowed of allowedLower) {
    if (allowed.includes(marketCategoryLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Get list of all supported broad categories
 */
export function getSupportedCategories(): string[] {
  return Object.keys(CATEGORY_PATTERNS);
}

