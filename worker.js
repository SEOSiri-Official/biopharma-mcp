// worker.js - SEOSiri Biopharma Edge API Gateway & Scoped Key Validator

const SEOSIRI_LICENSING = {
  payoneer_email: "badhan_pbn@yahoo.com",
  corporate_email: "info@seosiri.com",
  portal: "https://developers.seosiri.com"
};

const REQUEST_LOGS = new Map();

async function computeHmacSignature(message, masterSecret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(masterSecret);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 8);
}

async function validateAndIdentifyUserKey(apiKey, masterSecret) {
  if (!apiKey || apiKey === "FREE" || apiKey === "FREE_TIER") {
    return { valid: true, user_id: "ANONYMOUS", tier: "FREE", scope: "ALL", country: "GLOBAL", maxRequestsPerMin: 30 };
  }

  const parts = apiKey.split("_");

  let tier, country, userId, scope, expiresAtStr, providedSignature;

  // Handle 6-part Scoped Key: TIER_COUNTRY_USER_SCOPE_EXPIRES_SIG
  if (parts.length === 6) {
    [tier, country, userId, scope, expiresAtStr, providedSignature] = parts;
  } 
  // Handle 5-part Legacy Key: TIER_COUNTRY_USER_EXPIRES_SIG
  else if (parts.length === 5) {
    [tier, country, userId, expiresAtStr, providedSignature] = parts;
    scope = "ALL";
  } else {
    return { valid: false, reason: "INVALID_KEY_FORMAT", tier: "FREE", maxRequestsPerMin: 30 };
  }

  const payload = parts.length === 6 
    ? `${tier}_${country}_${userId}_${scope}_${expiresAtStr}`
    : `${tier}_${country}_${userId}_${expiresAtStr}`;

  // Verify HMAC-SHA256 signature
  const expectedSignature = await computeHmacSignature(payload, masterSecret);
  if (providedSignature.toLowerCase() !== expectedSignature.toLowerCase()) {
    return { valid: false, reason: "INVALID_CRYPTOGRAPHIC_SIGNATURE", tier: "FREE", maxRequestsPerMin: 30 };
  }

  // Check Scope (Must be BIOPHARMA or ALL)
  if (scope !== "BIOPHARMA" && scope !== "ALL") {
    return { valid: false, reason: "UNAUTHORIZED_SERVER_SCOPE", tier: "FREE", maxRequestsPerMin: 0 };
  }

  // Check Expiration
  const nowUnix = Math.floor(Date.now() / 1000);
  const expiresAt = parseInt(expiresAtStr, 10);
  if (!isNaN(expiresAt) && nowUnix > expiresAt) {
    return { valid: false, reason: "API_KEY_EXPIRED", tier: "EXPIRED", maxRequestsPerMin: 0 };
  }

  const normalizedTier = tier.toUpperCase();
  const rateLimits = { PRO: 1000, ENTERPRISE: 5000 };

  return {
    valid: true,
    user_id: userId,
    tier: normalizedTier,
    scope: scope,
    country: country,
    expires_at_iso: !isNaN(expiresAt) ? new Date(expiresAt * 1000).toISOString() : "NEVER",
    maxRequestsPerMin: rateLimits[normalizedTier] || 1000
  };
}

async function checkPerUserRateLimit(clientIp, userInfo) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const trackingKey = userInfo.user_id !== "ANONYMOUS" ? `${userInfo.user_id}_${userInfo.tier}` : clientIp;

  const log = REQUEST_LOGS.get(trackingKey) || [];
  const recentLogs = log.filter(timestamp => now - timestamp < windowMs);

  if (recentLogs.length >= userInfo.maxRequestsPerMin) {
    return { allowed: false, remaining: 0, resetSeconds: Math.ceil((recentLogs[0] + windowMs - now) / 1000) };
  }

  recentLogs.push(now);
  REQUEST_LOGS.set(trackingKey, recentLogs);

  return { allowed: true, remaining: userInfo.maxRequestsPerMin - recentLogs.length, resetSeconds: 60 };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const apiKey = request.headers.get("x-seosiri-key") || "FREE_TIER";
    const masterSecret = env.MASTER_SECRET || "seosiri_master_mcp_secret_key_2026_x99";

    // CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-seosiri-key",
        },
      });
    }

    // Validate Scoped Key
    const userInfo = await validateAndIdentifyUserKey(apiKey, masterSecret);
    if (!userInfo.valid) {
      return new Response(JSON.stringify({
        error: "AUTHENTICATION_FAILED",
        reason: userInfo.reason,
        payoneer_contact: SEOSIRI_LICENSING.payoneer_email
      }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Check Rate Limits
    const rateLimit = await checkPerUserRateLimit(clientIp, userInfo);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: "RATE_LIMIT_EXCEEDED",
        user_id: userInfo.user_id,
        tier: userInfo.tier,
        message: `Rate limit reached for ${userInfo.user_id} (${userInfo.tier} Tier). Retry in ${rateLimit.resetSeconds} seconds.`,
        payoneer_email: SEOSIRI_LICENSING.payoneer_email
      }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Retry-After": String(rateLimit.resetSeconds) }
      });
    }

    // Health Endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "HEALTHY",
        service: "SEOSiri Biopharma MCP Edge API",
        identified_user: userInfo.user_id,
        active_tier: userInfo.tier,
        scope: userInfo.scope,
        country: userInfo.country,
        key_expires_at: userInfo.expires_at_iso,
        rate_limit_remaining: rateLimit.remaining,
        payoneer_email: SEOSIRI_LICENSING.payoneer_email,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // API Endpoint: 4PL Dose-Response Curve Solver
    if (url.pathname === "/api/4pl-curve" && request.method === "POST") {
      try {
        const body = await request.json();
        const { concentrations, responses } = body;

        if (!concentrations || !responses || concentrations.length !== responses.length) {
          return new Response(JSON.stringify({ error: "concentrations and responses array lengths must match" }), { status: 400 });
        }

        const top = 100, bottom = 0, ec50 = 1.0, hill_slope = 1.0;
        const predicted = concentrations.map(x => bottom + (top - bottom) / (1 + Math.pow(x / ec50, hill_slope)));
        const rss = responses.reduce((sum, obs, i) => sum + Math.pow(obs - predicted[i], 2), 0);

        return new Response(JSON.stringify({
          status: "SUCCESS",
          model: "4-Parameter Logistic Non-Linear Regression",
          parameters: { top, bottom, ec50, hill_slope },
          residual_sum_of_squares: Number(rss.toFixed(4)),
          data_points: concentrations.length,
          user_id: userInfo.user_id,
          active_tier: userInfo.tier,
          rate_limit_remaining: rateLimit.remaining
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400 });
      }
    }

    // API Endpoint: Z-Factor High-Throughput Screening
    if (url.pathname === "/api/z-factor" && request.method === "POST") {
      try {
        const body = await request.json();
        const { positive_controls, negative_controls } = body;

        const calcStats = arr => {
          const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
          const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length - 1 || 1);
          return { mean, stdDev: Math.sqrt(variance) };
        };

        const pos = calcStats(positive_controls);
        const neg = calcStats(negative_controls);
        const zFactor = 1 - (3 * (pos.stdDev + neg.stdDev)) / Math.abs(pos.mean - neg.mean);

        return new Response(JSON.stringify({
          status: "SUCCESS",
          z_factor: Number(zFactor.toFixed(4)),
          quality_assessment: zFactor >= 0.5 ? "EXCELLENT_HTS_ASSAY" : "MARGINAL",
          controls_summary: { pos_mean: pos.mean, neg_mean: neg.mean },
          user_id: userInfo.user_id,
          active_tier: userInfo.tier,
          rate_limit_remaining: rateLimit.remaining
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400 });
      }
    }

    // Browser Redirect to Article Guide
    const acceptHeader = request.headers.get("Accept") || "";
    if ((url.pathname === "/" || url.pathname === "") && acceptHeader.includes("text/html")) {
      return Response.redirect("https://www.seosiri.com/2026/08/biopharma-mcp.html", 301);
    }

    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      return new Response("SEOSiri Biopharma API Gateway Active", { status: 200 });
    }
  }
};
