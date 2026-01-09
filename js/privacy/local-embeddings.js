/**
 * DropLit Local Embeddings Module
 * Layer 2: Client-Side Intelligence
 * 
 * Generates semantic embeddings entirely on the user's device.
 * Server NEVER sees the text or embeddings.
 * 
 * Uses: Transformers.js (Xenova) with MiniLM model
 * 
 * @version 1.0.0
 * @date 2026-01-09
 */

// ============================================================
// CONFIGURATION
// ============================================================

const EMBEDDINGS_CONFIG = {
  // Model selection (trade-off: size vs quality)
  models: {
    // Recommended: Good balance of size and quality
    default: 'Xenova/all-MiniLM-L6-v2',      // 384 dims, ~23MB
    // Alternative: Smaller, faster
    light: 'Xenova/all-MiniLM-L12-v2',       // 384 dims, ~33MB
    // Alternative: Multilingual (EN + RU + more)
    multilingual: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', // 384 dims, ~470MB
  },
  
  // Current model (can be changed in settings)
  currentModel: 'Xenova/all-MiniLM-L6-v2',
  
  // Embedding dimensions (depends on model)
  dimensions: 384,
  
  // Processing settings
  maxTextLength: 512,        // Max tokens for model
  batchSize: 10,             // Process N drops at once
  
  // Storage
  cacheEmbeddings: true,     // Cache in IndexedDB
  dbName: 'droplit_embeddings',
  storeName: 'embeddings',
  
  // Performance
  useWebWorker: true,        // Run in background thread
  progressCallback: null,    // For UI progress updates
};

// ============================================================
// STATE
// ============================================================

let embedderPipeline = null;
let isModelLoading = false;
let modelLoadPromise = null;
let embeddingsDB = null;

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the embeddings system
 * Loads the ML model and prepares IndexedDB cache
 * 
 * @param {Object} options - Configuration overrides
 * @returns {Promise<boolean>} - Success status
 */
async function initLocalEmbeddings(options = {}) {
  console.log('[Embeddings] Initializing local embeddings system...');
  
  // Merge options
  Object.assign(EMBEDDINGS_CONFIG, options);
  
  try {
    // Initialize IndexedDB for caching
    await initEmbeddingsDB();
    
    // Pre-load the model (optional, can be lazy)
    if (options.preloadModel) {
      await loadEmbeddingModel();
    }
    
    console.log('[Embeddings] System initialized successfully');
    return true;
    
  } catch (error) {
    console.error('[Embeddings] Initialization failed:', error);
    return false;
  }
}

/**
 * Initialize IndexedDB for embedding cache
 */
async function initEmbeddingsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EMBEDDINGS_CONFIG.dbName, 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      embeddingsDB = request.result;
      resolve();
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Store for cached embeddings
      if (!db.objectStoreNames.contains(EMBEDDINGS_CONFIG.storeName)) {
        const store = db.createObjectStore(EMBEDDINGS_CONFIG.storeName, { keyPath: 'dropId' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('textHash', 'textHash', { unique: false });
      }
    };
  });
}

// ============================================================
// MODEL LOADING
// ============================================================

/**
 * Load the embedding model
 * Uses dynamic import to load Transformers.js only when needed
 * 
 * @returns {Promise<Object>} - The pipeline object
 */
async function loadEmbeddingModel() {
  // Return existing pipeline if loaded
  if (embedderPipeline) {
    return embedderPipeline;
  }
  
  // Return existing promise if loading
  if (isModelLoading && modelLoadPromise) {
    return modelLoadPromise;
  }
  
  isModelLoading = true;
  
  modelLoadPromise = (async () => {
    console.log('[Embeddings] Loading model:', EMBEDDINGS_CONFIG.currentModel);
    
    const startTime = Date.now();
    
    try {
      // Dynamic import of Transformers.js
      // This allows the main app to load without waiting for ML library
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');
      
      // Configure Transformers.js
      env.allowLocalModels = false;  // Use CDN models
      env.useBrowserCache = true;    // Cache model in browser
      
      // Create the pipeline
      embedderPipeline = await pipeline(
        'feature-extraction',
        EMBEDDINGS_CONFIG.currentModel,
        {
          progress_callback: (progress) => {
            if (EMBEDDINGS_CONFIG.progressCallback) {
              EMBEDDINGS_CONFIG.progressCallback(progress);
            }
            // Log progress for debugging
            if (progress.status === 'progress') {
              console.log(`[Embeddings] Loading: ${progress.file} - ${Math.round(progress.progress)}%`);
            }
          }
        }
      );
      
      const loadTime = Date.now() - startTime;
      console.log(`[Embeddings] Model loaded in ${loadTime}ms`);
      
      isModelLoading = false;
      return embedderPipeline;
      
    } catch (error) {
      console.error('[Embeddings] Failed to load model:', error);
      isModelLoading = false;
      modelLoadPromise = null;
      throw error;
    }
  })();
  
  return modelLoadPromise;
}

/**
 * Check if model is loaded and ready
 * @returns {boolean}
 */
function isModelReady() {
  return embedderPipeline !== null;
}

/**
 * Get model loading status
 * @returns {Object} - { loaded, loading, model }
 */
function getModelStatus() {
  return {
    loaded: embedderPipeline !== null,
    loading: isModelLoading,
    model: EMBEDDINGS_CONFIG.currentModel
  };
}

// ============================================================
// EMBEDDING GENERATION
// ============================================================

/**
 * Generate embedding for a single text
 * All processing happens locally - nothing sent to server
 * 
 * @param {string} text - Text to embed
 * @returns {Promise<Float32Array>} - Embedding vector (384 dims)
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text for embedding');
  }
  
  // Ensure model is loaded
  const pipeline = await loadEmbeddingModel();
  
  // Truncate if too long
  const truncatedText = text.slice(0, EMBEDDINGS_CONFIG.maxTextLength * 4); // ~4 chars per token
  
  try {
    // Generate embedding
    const output = await pipeline(truncatedText, {
      pooling: 'mean',      // Average of all token embeddings
      normalize: true        // L2 normalize for cosine similarity
    });
    
    // Extract the embedding array
    return new Float32Array(output.data);
    
  } catch (error) {
    console.error('[Embeddings] Generation failed:', error);
    throw error;
  }
}

/**
 * Generate embedding for a drop
 * Caches result in IndexedDB
 * 
 * @param {Object} drop - Drop object with text content
 * @returns {Promise<Float32Array>} - Embedding vector
 */
async function generateDropEmbedding(drop) {
  if (!drop || !drop.id) {
    throw new Error('Invalid drop');
  }
  
  // Get text content (handle different field names)
  const text = drop.text || drop.content || '';
  
  if (!text) {
    console.warn('[Embeddings] Drop has no text content:', drop.id);
    return null;
  }
  
  // Check cache first
  const textHash = await hashText(text);
  const cached = await getCachedEmbedding(drop.id, textHash);
  
  if (cached) {
    console.log('[Embeddings] Using cached embedding for drop:', drop.id);
    return cached;
  }
  
  // Generate new embedding
  const embedding = await generateEmbedding(text);
  
  // Cache it
  if (EMBEDDINGS_CONFIG.cacheEmbeddings) {
    await cacheEmbedding(drop.id, textHash, embedding);
  }
  
  return embedding;
}

/**
 * Generate embeddings for multiple drops (batch)
 * 
 * @param {Array} drops - Array of drop objects
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Map>} - Map of dropId -> embedding
 */
async function generateDropEmbeddingsBatch(drops, onProgress = null) {
  const results = new Map();
  const total = drops.length;
  
  console.log(`[Embeddings] Processing batch of ${total} drops...`);
  
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    
    try {
      const embedding = await generateDropEmbedding(drop);
      if (embedding) {
        results.set(drop.id, embedding);
      }
    } catch (error) {
      console.error(`[Embeddings] Failed for drop ${drop.id}:`, error);
    }
    
    // Progress callback
    if (onProgress) {
      onProgress(i + 1, total);
    }
  }
  
  console.log(`[Embeddings] Batch complete: ${results.size}/${total} successful`);
  return results;
}

// ============================================================
// SEMANTIC SEARCH (100% LOCAL)
// ============================================================

/**
 * Calculate cosine similarity between two vectors
 * 
 * @param {Float32Array} a - First vector
 * @param {Float32Array} b - Second vector
 * @returns {number} - Similarity score (0 to 1)
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  // If vectors are normalized, this simplifies to just dotProduct
  // But we compute full formula for safety
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (magnitude === 0) return 0;
  
  return dotProduct / magnitude;
}

/**
 * Semantic search across drops (100% local)
 * Server NEVER knows what you're searching for
 * 
 * @param {string} query - Search query
 * @param {Array} drops - Array of drops with embeddings
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Sorted results with similarity scores
 */
async function semanticSearch(query, drops, options = {}) {
  const {
    topK = 10,           // Return top K results
    threshold = 0.3,     // Minimum similarity threshold
    includeScores = true // Include similarity scores in results
  } = options;
  
  console.log(`[Embeddings] Semantic search: "${query.substring(0, 50)}..."`);
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  
  // Score all drops
  const scored = [];
  
  for (const drop of drops) {
    // Get or generate embedding for drop
    let dropEmbedding = drop.embedding;
    
    if (!dropEmbedding) {
      // Try to get from cache
      const text = drop.text || drop.content || '';
      if (text) {
        const textHash = await hashText(text);
        dropEmbedding = await getCachedEmbedding(drop.id, textHash);
        
        // Generate if not cached
        if (!dropEmbedding) {
          dropEmbedding = await generateDropEmbedding(drop);
        }
      }
    }
    
    if (dropEmbedding) {
      const similarity = cosineSimilarity(queryEmbedding, dropEmbedding);
      
      if (similarity >= threshold) {
        scored.push({
          drop,
          similarity,
          score: similarity // alias
        });
      }
    }
  }
  
  // Sort by similarity (highest first)
  scored.sort((a, b) => b.similarity - a.similarity);
  
  // Return top K
  const results = scored.slice(0, topK);
  
  console.log(`[Embeddings] Found ${results.length} results above threshold ${threshold}`);
  
  // Optionally strip scores
  if (!includeScores) {
    return results.map(r => r.drop);
  }
  
  return results;
}

/**
 * Find similar drops to a given drop
 * 
 * @param {Object} targetDrop - The drop to find similar to
 * @param {Array} allDrops - All drops to search
 * @param {number} topK - Number of results
 * @returns {Promise<Array>} - Similar drops with scores
 */
async function findSimilarDrops(targetDrop, allDrops, topK = 5) {
  const targetText = targetDrop.text || targetDrop.content || '';
  
  if (!targetText) {
    return [];
  }
  
  // Filter out the target drop itself
  const otherDrops = allDrops.filter(d => d.id !== targetDrop.id);
  
  return semanticSearch(targetText, otherDrops, { topK, threshold: 0.4 });
}

// ============================================================
// CACHING
// ============================================================

/**
 * Hash text for cache key
 * @param {string} text 
 * @returns {Promise<string>}
 */
async function hashText(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

/**
 * Get cached embedding
 * @param {string|number} dropId 
 * @param {string} textHash 
 * @returns {Promise<Float32Array|null>}
 */
async function getCachedEmbedding(dropId, textHash) {
  if (!embeddingsDB) {
    return null;
  }
  
  return new Promise((resolve) => {
    try {
      const tx = embeddingsDB.transaction(EMBEDDINGS_CONFIG.storeName, 'readonly');
      const store = tx.objectStore(EMBEDDINGS_CONFIG.storeName);
      const request = store.get(String(dropId));
      
      request.onsuccess = () => {
        const record = request.result;
        
        // Check if cached and text hasn't changed
        if (record && record.textHash === textHash && record.embedding) {
          resolve(new Float32Array(record.embedding));
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Cache embedding
 * @param {string|number} dropId 
 * @param {string} textHash 
 * @param {Float32Array} embedding 
 */
async function cacheEmbedding(dropId, textHash, embedding) {
  if (!embeddingsDB) {
    return;
  }
  
  return new Promise((resolve, reject) => {
    try {
      const tx = embeddingsDB.transaction(EMBEDDINGS_CONFIG.storeName, 'readwrite');
      const store = tx.objectStore(EMBEDDINGS_CONFIG.storeName);
      
      const record = {
        dropId: String(dropId),
        textHash,
        embedding: Array.from(embedding), // Convert to regular array for storage
        timestamp: Date.now(),
        model: EMBEDDINGS_CONFIG.currentModel
      };
      
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Clear embedding cache
 * @param {string|number} dropId - Optional: clear specific drop, or all if not provided
 */
async function clearEmbeddingCache(dropId = null) {
  if (!embeddingsDB) {
    return;
  }
  
  return new Promise((resolve, reject) => {
    try {
      const tx = embeddingsDB.transaction(EMBEDDINGS_CONFIG.storeName, 'readwrite');
      const store = tx.objectStore(EMBEDDINGS_CONFIG.storeName);
      
      if (dropId) {
        store.delete(String(dropId));
      } else {
        store.clear();
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get cache statistics
 * @returns {Promise<Object>}
 */
async function getEmbeddingCacheStats() {
  if (!embeddingsDB) {
    return { count: 0, size: 0 };
  }
  
  return new Promise((resolve) => {
    try {
      const tx = embeddingsDB.transaction(EMBEDDINGS_CONFIG.storeName, 'readonly');
      const store = tx.objectStore(EMBEDDINGS_CONFIG.storeName);
      const countRequest = store.count();
      
      countRequest.onsuccess = () => {
        resolve({
          count: countRequest.result,
          // Approximate size: 384 dims * 4 bytes * count
          estimatedSizeBytes: countRequest.result * 384 * 4,
          model: EMBEDDINGS_CONFIG.currentModel
        });
      };
      
      countRequest.onerror = () => resolve({ count: 0, size: 0 });
    } catch {
      resolve({ count: 0, size: 0 });
    }
  });
}

// ============================================================
// INTEGRATION WITH DROPLIT
// ============================================================

/**
 * Process all drops and generate embeddings
 * Call this when user enables the feature or on first load
 * 
 * @param {Array} drops - All user's drops
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Statistics
 */
async function indexAllDrops(drops, onProgress = null) {
  console.log(`[Embeddings] Starting full index of ${drops.length} drops...`);
  
  const startTime = Date.now();
  let processed = 0;
  let cached = 0;
  let failed = 0;
  
  // Ensure model is loaded first
  await loadEmbeddingModel();
  
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    const text = drop.text || drop.content || '';
    
    if (!text) {
      continue;
    }
    
    try {
      // Check if already cached
      const textHash = await hashText(text);
      const existing = await getCachedEmbedding(drop.id, textHash);
      
      if (existing) {
        cached++;
      } else {
        await generateDropEmbedding(drop);
        processed++;
      }
    } catch (error) {
      failed++;
      console.error(`[Embeddings] Failed to index drop ${drop.id}:`, error);
    }
    
    if (onProgress) {
      onProgress(i + 1, drops.length, { processed, cached, failed });
    }
  }
  
  const duration = Date.now() - startTime;
  
  const stats = {
    total: drops.length,
    processed,
    cached,
    failed,
    durationMs: duration
  };
  
  console.log('[Embeddings] Indexing complete:', stats);
  
  return stats;
}

/**
 * Get drops for ASKI context using semantic search
 * Returns most relevant drops for the query
 * 
 * @param {string} query - User's message to ASKI
 * @param {Array} allDrops - All user's drops
 * @param {number} limit - Max drops to return
 * @returns {Promise<Array>} - Relevant drops
 */
async function getRelevantDropsForAski(query, allDrops, limit = 10) {
  // If query is very short, skip semantic search
  if (query.length < 10) {
    // Return recent drops instead
    return allDrops
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);
  }
  
  const results = await semanticSearch(query, allDrops, {
    topK: limit,
    threshold: 0.25,
    includeScores: false
  });
  
  return results;
}

// ============================================================
// EXPORTS
// ============================================================

// For ES modules
export {
  // Initialization
  initLocalEmbeddings,
  loadEmbeddingModel,
  isModelReady,
  getModelStatus,
  
  // Embedding generation
  generateEmbedding,
  generateDropEmbedding,
  generateDropEmbeddingsBatch,
  
  // Semantic search
  semanticSearch,
  findSimilarDrops,
  cosineSimilarity,
  
  // Cache management
  clearEmbeddingCache,
  getEmbeddingCacheStats,
  
  // Integration
  indexAllDrops,
  getRelevantDropsForAski,
  
  // Config
  EMBEDDINGS_CONFIG
};

// For script tag usage (attach to window)
if (typeof window !== 'undefined') {
  window.DropLitEmbeddings = {
    init: initLocalEmbeddings,
    loadModel: loadEmbeddingModel,
    isReady: isModelReady,
    getStatus: getModelStatus,
    
    generate: generateEmbedding,
    generateForDrop: generateDropEmbedding,
    generateBatch: generateDropEmbeddingsBatch,
    
    search: semanticSearch,
    findSimilar: findSimilarDrops,
    
    clearCache: clearEmbeddingCache,
    getCacheStats: getEmbeddingCacheStats,
    
    indexAll: indexAllDrops,
    getRelevantForAski: getRelevantDropsForAski,
    
    config: EMBEDDINGS_CONFIG
  };
  
  console.log('[Embeddings] Module loaded. Access via window.DropLitEmbeddings');
}
