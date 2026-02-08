/**
 * DropLit Zero-Knowledge Search Module
 * Layer 3: Privacy-Preserving Search
 * 
 * Enables server-side search WITHOUT the server knowing:
 * - What you're searching for
 * - What words are in your drops
 * 
 * Uses: HMAC-SHA256 based search tokens
 * 
 * How it works:
 * 1. Client generates HMAC tokens from words using secret key
 * 2. Tokens are stored on server alongside encrypted drops
 * 3. When searching, client generates token for query
 * 4. Server finds matches by comparing tokens (not words)
 * 5. Server returns encrypted drops, client decrypts
 * 
 * Result: Server can search, but never knows WHAT it's searching
 * 
 * @version 1.0.0
 * @date 2026-01-09
 */

// ============================================================
// CONFIGURATION
// ============================================================

const ZK_SEARCH_CONFIG = {
  // Token settings
  tokenLength: 16,           // Hex characters (8 bytes)
  maxTokensPerDrop: 500,     // Limit to prevent huge indices
  
  // Text processing
  minWordLength: 2,          // Skip very short words
  maxWordLength: 50,         // Skip very long words
  
  // Stop words (common words to skip)
  // These don't help search and waste storage
  stopWords: new Set([
    // English
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
    'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and',
    'but', 'if', 'or', 'because', 'until', 'while', 'this', 'that', 'these',
    'those', 'am', 'it', 'its', 'he', 'she', 'they', 'we', 'you', 'i', 'me',
    'him', 'her', 'them', 'us', 'my', 'your', 'his', 'our', 'their', 'what',
    
    // Russian
    'и', 'в', 'на', 'с', 'по', 'для', 'к', 'за', 'из', 'о', 'от', 'у', 'до',
    'не', 'что', 'как', 'это', 'все', 'так', 'его', 'но', 'да', 'ты', 'уже',
    'же', 'вы', 'он', 'она', 'они', 'мы', 'я', 'был', 'была', 'были', 'быть',
    'есть', 'бы', 'при', 'ни', 'или', 'то', 'если', 'чтобы', 'когда', 'где',
    'кто', 'тот', 'этот', 'эта', 'эти', 'который', 'которая', 'которые',
    'ещё', 'еще', 'тоже', 'также', 'только', 'очень', 'даже', 'потом',
    'теперь', 'уже', 'вот', 'ну', 'вообще', 'просто', 'может', 'надо'
  ]),
  
  // N-gram settings for partial matching
  enableNgrams: true,
  ngramMinLength: 3,
  ngramMaxLength: 4,
};

// ============================================================
// KEY MANAGEMENT
// ============================================================

let searchKey = null;

/**
 * Initialize ZK Search with encryption key
 * The search key is derived from the master encryption key
 * 
 * @param {CryptoKey|Uint8Array} masterKey - Master encryption key
 * @returns {Promise<boolean>}
 */
async function initZKSearch(masterKey) {
  console.log('[ZK-Search] Initializing...');
  
  try {
    // Derive a separate key for search tokens
    // This is important: even if search tokens leak, encryption key is safe
    searchKey = await deriveSearchKey(masterKey);
    console.log('[ZK-Search] Initialized successfully');
    return true;
  } catch (error) {
    console.error('[ZK-Search] Initialization failed:', error);
    return false;
  }
}

/**
 * Derive search key from master key
 * Uses HKDF-like derivation
 * 
 * v1.1: Handles non-extractable CryptoKeys by falling back to
 *       a persistent random search key stored in localStorage
 * 
 * @param {CryptoKey|Uint8Array} masterKey 
 * @returns {Promise<CryptoKey>}
 */
async function deriveSearchKey(masterKey) {
  // Convert to raw bytes if needed
  let keyBytes;
  
  if (masterKey instanceof CryptoKey) {
    try {
      keyBytes = await crypto.subtle.exportKey('raw', masterKey);
    } catch (e) {
      // Key is non-extractable — use persistent fallback
      console.warn('[ZK-Search] Master key not extractable, using persistent search key');
      keyBytes = await getOrCreatePersistentSearchSeed();
    }
  } else if (masterKey instanceof Uint8Array) {
    keyBytes = masterKey.buffer;
  } else {
    throw new Error('Invalid master key format');
  }
  
  // Derive search key using SHA-256 with domain separator
  const encoder = new TextEncoder();
  const separator = encoder.encode('droplit-zk-search-v1');
  
  const combined = new Uint8Array(keyBytes.byteLength + separator.length);
  combined.set(new Uint8Array(keyBytes), 0);
  combined.set(separator, keyBytes.byteLength);
  
  const derivedHash = await crypto.subtle.digest('SHA-256', combined);
  
  // Import as HMAC key
  return crypto.subtle.importKey(
    'raw',
    derivedHash,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Get or create a persistent random seed for search key derivation.
 * Used when the master CryptoKey is non-extractable.
 * Stored in localStorage as hex string.
 * 
 * @returns {Promise<ArrayBuffer>} 32-byte seed
 */
async function getOrCreatePersistentSearchSeed() {
  const STORAGE_KEY = 'droplit_zk_search_seed';
  const stored = localStorage.getItem(STORAGE_KEY);
  
  if (stored) {
    // Convert hex back to ArrayBuffer
    const bytes = new Uint8Array(stored.match(/.{2}/g).map(b => parseInt(b, 16)));
    return bytes.buffer;
  }
  
  // Generate new random 32-byte seed
  const seed = crypto.getRandomValues(new Uint8Array(32));
  
  // Store as hex
  const hex = Array.from(seed).map(b => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(STORAGE_KEY, hex);
  
  console.log('[ZK-Search] Created persistent search seed');
  return seed.buffer;
}

/**
 * Check if ZK Search is initialized
 * @returns {boolean}
 */
function isZKSearchReady() {
  return searchKey !== null;
}

// ============================================================
// TEXT PROCESSING
// ============================================================

/**
 * Tokenize text into searchable words
 * 
 * @param {string} text - Input text
 * @returns {Array<string>} - Unique words
 */
function tokenizeText(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // Normalize: lowercase, remove special chars
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Keep letters, numbers, spaces (Unicode-aware)
    .replace(/\s+/g, ' ')
    .trim();
  
  // Split into words
  const words = normalized.split(' ');
  
  // Filter and deduplicate
  const uniqueWords = new Set();
  
  for (const word of words) {
    // Skip if too short or too long
    if (word.length < ZK_SEARCH_CONFIG.minWordLength) continue;
    if (word.length > ZK_SEARCH_CONFIG.maxWordLength) continue;
    
    // Skip stop words
    if (ZK_SEARCH_CONFIG.stopWords.has(word)) continue;
    
    uniqueWords.add(word);
    
    // Generate n-grams for partial matching
    if (ZK_SEARCH_CONFIG.enableNgrams && word.length >= ZK_SEARCH_CONFIG.ngramMinLength) {
      const ngrams = generateNgrams(word);
      for (const ngram of ngrams) {
        uniqueWords.add(ngram);
      }
    }
  }
  
  // Limit total tokens
  const result = Array.from(uniqueWords);
  if (result.length > ZK_SEARCH_CONFIG.maxTokensPerDrop) {
    return result.slice(0, ZK_SEARCH_CONFIG.maxTokensPerDrop);
  }
  
  return result;
}

/**
 * Generate n-grams from a word
 * Allows partial matching (e.g., "prog" matches "programming")
 * 
 * @param {string} word 
 * @returns {Array<string>}
 */
function generateNgrams(word) {
  const ngrams = [];
  const minLen = ZK_SEARCH_CONFIG.ngramMinLength;
  const maxLen = Math.min(ZK_SEARCH_CONFIG.ngramMaxLength, word.length - 1);
  
  for (let len = minLen; len <= maxLen; len++) {
    for (let i = 0; i <= word.length - len; i++) {
      ngrams.push(word.substring(i, i + len));
    }
  }
  
  return ngrams;
}

// ============================================================
// TOKEN GENERATION
// ============================================================

/**
 * Generate HMAC token for a word
 * The token is deterministic: same word + key = same token
 * But without the key, you can't reverse the token to the word
 * 
 * @param {string} word - Word to tokenize
 * @returns {Promise<string>} - Hex token
 */
async function generateToken(word) {
  if (!searchKey) {
    throw new Error('ZK Search not initialized');
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(word.toLowerCase());
  
  const signature = await crypto.subtle.sign('HMAC', searchKey, data);
  const hashArray = Array.from(new Uint8Array(signature));
  
  // Take first N characters as token
  return hashArray
    .slice(0, ZK_SEARCH_CONFIG.tokenLength / 2)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate search tokens for a text
 * These tokens will be stored on server alongside encrypted drop
 * 
 * @param {string} text - Text content
 * @returns {Promise<Array<string>>} - Array of tokens
 */
async function generateSearchTokens(text) {
  if (!searchKey) {
    throw new Error('ZK Search not initialized');
  }
  
  const words = tokenizeText(text);
  const tokens = [];
  
  for (const word of words) {
    const token = await generateToken(word);
    tokens.push(token);
  }
  
  // Remove duplicates (shouldn't happen, but safety)
  return [...new Set(tokens)];
}

/**
 * Generate search tokens for a drop
 * 
 * @param {Object} drop - Drop object
 * @returns {Promise<Array<string>>} - Array of tokens
 */
async function generateDropSearchTokens(drop) {
  const text = drop.text || drop.content || '';
  
  // Also include category and tags for searchability
  let searchableText = text;
  
  if (drop.category) {
    searchableText += ' ' + drop.category;
  }
  
  if (drop.tags && Array.isArray(drop.tags)) {
    searchableText += ' ' + drop.tags.join(' ');
  }
  
  return generateSearchTokens(searchableText);
}

// ============================================================
// SEARCH OPERATIONS
// ============================================================

/**
 * Generate query tokens for search
 * 
 * @param {string} query - Search query
 * @returns {Promise<Array<string>>} - Query tokens
 */
async function generateQueryTokens(query) {
  if (!searchKey) {
    throw new Error('ZK Search not initialized');
  }
  
  // Tokenize query
  const words = tokenizeText(query);
  const tokens = [];
  
  for (const word of words) {
    const token = await generateToken(word);
    tokens.push(token);
  }
  
  return tokens;
}

/**
 * Search locally (for drops already in memory)
 * Matches drops that have ALL query tokens
 * 
 * @param {Array<string>} queryTokens - Tokens from query
 * @param {Array<Object>} drops - Drops with searchTokens field
 * @param {Object} options - Search options
 * @returns {Array<Object>} - Matching drops
 */
function searchLocal(queryTokens, drops, options = {}) {
  const {
    matchAll = false,     // Require all tokens to match (AND) vs any (OR)
    minMatches = 1,       // Minimum token matches required
  } = options;
  
  const results = [];
  
  for (const drop of drops) {
    if (!drop.searchTokens || !Array.isArray(drop.searchTokens)) {
      continue;
    }
    
    const dropTokenSet = new Set(drop.searchTokens);
    let matchCount = 0;
    
    for (const queryToken of queryTokens) {
      if (dropTokenSet.has(queryToken)) {
        matchCount++;
      }
    }
    
    // Check if matches criteria
    const meetsMinimum = matchCount >= minMatches;
    const meetsAll = matchAll ? matchCount === queryTokens.length : true;
    
    if (meetsMinimum && meetsAll) {
      results.push({
        drop,
        matchCount,
        matchRatio: matchCount / queryTokens.length
      });
    }
  }
  
  // Sort by match count (highest first)
  results.sort((a, b) => b.matchCount - a.matchCount);
  
  return results;
}

/**
 * Prepare search request for server
 * Server can execute search without knowing what's being searched
 * 
 * @param {string} query - Search query
 * @returns {Promise<Object>} - Request payload for server
 */
async function prepareServerSearchRequest(query) {
  const queryTokens = await generateQueryTokens(query);
  
  return {
    tokens: queryTokens,
    // Don't send the actual query!
    // Don't send any metadata that could reveal the query
    timestamp: Date.now()
  };
}

// ============================================================
// INTEGRATION WITH DROPS
// ============================================================

/**
 * Prepare drop for sync with search tokens
 * Call this before sending drop to server
 * 
 * @param {Object} drop - Drop to prepare
 * @returns {Promise<Object>} - Drop with searchTokens
 */
async function prepareDropForZKSearch(drop) {
  const searchTokens = await generateDropSearchTokens(drop);
  
  return {
    ...drop,
    searchTokens
  };
}

/**
 * Batch process drops for ZK search
 * 
 * @param {Array<Object>} drops - Drops to process
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array<Object>>} - Drops with searchTokens
 */
async function prepareDropsForZKSearch(drops, onProgress = null) {
  const results = [];
  
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    const prepared = await prepareDropForZKSearch(drop);
    results.push(prepared);
    
    if (onProgress) {
      onProgress(i + 1, drops.length);
    }
  }
  
  return results;
}

// ============================================================
// HYBRID SEARCH (LOCAL + SERVER)
// ============================================================

/**
 * Hybrid search combining:
 * 1. ZK token search (exact word match)
 * 2. Semantic search (meaning match) - if embeddings available
 * 
 * @param {string} query - Search query
 * @param {Array<Object>} drops - All drops
 * @param {Object} options - Search options
 * @returns {Promise<Array<Object>>} - Search results
 */
async function hybridSearch(query, drops, options = {}) {
  const {
    useSemanticSearch = true,
    semanticWeight = 0.6,    // Weight for semantic results (0-1)
    tokenWeight = 0.4,       // Weight for token results (0-1)
    topK = 20,
  } = options;
  
  const results = new Map(); // dropId -> { drop, score }
  
  // 1. ZK Token Search
  const queryTokens = await generateQueryTokens(query);
  const tokenResults = searchLocal(queryTokens, drops, { minMatches: 1 });
  
  for (const result of tokenResults) {
    const dropId = result.drop.id;
    const score = result.matchRatio * tokenWeight;
    
    results.set(dropId, {
      drop: result.drop,
      score,
      tokenMatch: result.matchRatio
    });
  }
  
  // 2. Semantic Search (if available)
  if (useSemanticSearch && window.DropLitEmbeddings && window.DropLitEmbeddings.isReady()) {
    try {
      const semanticResults = await window.DropLitEmbeddings.search(query, drops, {
        topK: topK * 2,
        threshold: 0.2,
        includeScores: true
      });
      
      for (const result of semanticResults) {
        const dropId = result.drop.id;
        const semanticScore = result.similarity * semanticWeight;
        
        if (results.has(dropId)) {
          // Combine scores
          const existing = results.get(dropId);
          existing.score += semanticScore;
          existing.semanticMatch = result.similarity;
        } else {
          results.set(dropId, {
            drop: result.drop,
            score: semanticScore,
            semanticMatch: result.similarity
          });
        }
      }
    } catch (error) {
      console.warn('[ZK-Search] Semantic search failed:', error);
    }
  }
  
  // Sort by combined score
  const sortedResults = Array.from(results.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  
  return sortedResults;
}

// ============================================================
// SUPABASE INTEGRATION
// ============================================================

/**
 * SQL for Supabase: Create search tokens table
 * Run this in Supabase SQL editor
 */
const SUPABASE_SCHEMA = `
-- Table for search tokens
CREATE TABLE IF NOT EXISTS drop_search_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_id UUID NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  tokens TEXT[] NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_drop_tokens UNIQUE (drop_id)
);

-- Index for token search
CREATE INDEX IF NOT EXISTS idx_search_tokens_gin 
ON drop_search_tokens USING GIN (tokens);

-- Function to search by tokens
CREATE OR REPLACE FUNCTION search_by_tokens(
  query_tokens TEXT[],
  match_user_id UUID,
  min_matches INT DEFAULT 1
) 
RETURNS TABLE (
  drop_id UUID,
  match_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dst.drop_id,
    (SELECT COUNT(*) FROM unnest(query_tokens) qt WHERE qt = ANY(dst.tokens))::INT as match_count
  FROM drop_search_tokens dst
  JOIN drops d ON dst.drop_id = d.id
  WHERE d.user_id = match_user_id
    AND dst.tokens && query_tokens  -- GIN index intersection
  HAVING (SELECT COUNT(*) FROM unnest(query_tokens) qt WHERE qt = ANY(dst.tokens)) >= min_matches
  ORDER BY match_count DESC;
END;
$$ LANGUAGE plpgsql;
`;

/**
 * Get Supabase schema SQL
 * @returns {string}
 */
function getSupabaseSchema() {
  return SUPABASE_SCHEMA;
}

/**
 * Sync search tokens to Supabase
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} dropId - Drop UUID in Supabase
 * @param {Array<string>} tokens - Search tokens
 * @returns {Promise<boolean>}
 */
async function syncTokensToSupabase(supabase, dropId, tokens) {
  try {
    const { error } = await supabase
      .from('drop_search_tokens')
      .upsert({
        drop_id: dropId,
        tokens: tokens,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'drop_id'
      });
    
    if (error) {
      console.error('[ZK-Search] Failed to sync tokens:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[ZK-Search] Sync error:', error);
    return false;
  }
}

/**
 * Search via Supabase (server-side)
 * Server executes search but doesn't know what's being searched
 * 
 * @param {Object} supabase - Supabase client
 * @param {string} query - Search query
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Matching drop IDs with match counts
 */
async function searchViaSupabase(supabase, query, userId) {
  const queryTokens = await generateQueryTokens(query);
  
  try {
    const { data, error } = await supabase
      .rpc('search_by_tokens', {
        query_tokens: queryTokens,
        match_user_id: userId,
        min_matches: 1
      });
    
    if (error) {
      console.error('[ZK-Search] Supabase search error:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('[ZK-Search] Search error:', error);
    return [];
  }
}

// ============================================================
// EXPORTS
// ============================================================

// ES module exports removed for script tag compatibility
// Use window.DropLitZKSearch instead

// For script tag usage
if (typeof window !== 'undefined') {
  window.DropLitZKSearch = {
    init: initZKSearch,
    isReady: isZKSearchReady,
    
    generateToken,
    generateTokens: generateSearchTokens,
    generateDropTokens: generateDropSearchTokens,
    generateQueryTokens,
    
    searchLocal,
    hybridSearch,
    prepareRequest: prepareServerSearchRequest,
    
    prepareDrop: prepareDropForZKSearch,
    prepareDrops: prepareDropsForZKSearch,
    
    getSchema: getSupabaseSchema,
    syncToSupabase: syncTokensToSupabase,
    searchSupabase: searchViaSupabase,
    
    tokenize: tokenizeText,
    
    config: ZK_SEARCH_CONFIG
  };
  
  console.log('[ZK-Search] Module loaded. Access via window.DropLitZKSearch');
}
