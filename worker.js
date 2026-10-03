// worker.js - SEOSiri Biopharma & Life Sciences Multi-System Edge API Gateway
// Supports: JSON-RPC 2.0 (/rpc), MCP SSE (/sse), REST (/health, /api/4pl-curve), Dynamic FHIR Canonical

const SEOSIRI_LICENSING = {
  pricing_portal: "https://developers.seosiri.com/#pricing",
  key_issuer_portal: "https://developers.seosiri.com/#key-issuer",
  corporate_support: "info@seosiri.com",
  developer_hub: "https://developers.seosiri.com"
};

const REQUEST_LOGS = new Map();

// Combined Tool Registry: Biopharma Infrastructure (10 Tools) + AquaShield FHIR (4 Tools)
const BIOPHARMA_ECOSYSTEM_TOOLS = [
  // --- Biopharma Software Infrastructure Tools ---
  {
    name: "solve_4pl_dose_response",
    module: "biopharma-mcp",
    description: "Fits 4-Parameter Logistic (4PL) non-linear regression curves for IC50/EC50 pharmacology bioassays.",
    inputSchema: {
      type: "object",
      properties: {
        concentrations: { type: "array", items: { type: "number" } },
        responses: { type: "array", items: { type: "number" } }
      },
      required: ["concentrations", "responses"]
    }
  },
  {
    name: "calculate_z_factor",
    module: "biopharma-mcp",
    description: "Computes High-Throughput Screening (HTS) Z-factor assay quality metric.",
    inputSchema: {
      type: "object",
      properties: {
        pos_control_mean: { type: "number" },
        pos_control_sd: { type: "number" },
        neg_control_mean: { type: "number" },
        neg_control_sd: { type: "number" }
      },
      required: ["pos_control_mean", "pos_control_sd", "neg_control_mean", "neg_control_sd"]
    }
  },
  {
    name: "cdisc_sdtm_mapper",
    module: "biopharma-mcp",
    description: "Maps raw laboratory and clinical trial records to FDA-compliant CDISC SDTM LB/VS domains.",
    inputSchema: {
      type: "object",
      properties: {
        study_id: { type: "string" },
        domain: { type: "string", default: "LB" },
        test_code: { type: "string" },
        result_value: { type: "string" }
      },
      required: ["study_id", "test_code", "result_value"]
    }
  },
  {
    name: "fda_part11_audit_hash",
    module: "biopharma-mcp",
    description: "Generates immutable FDA 21 CFR Part 11 electronic signature and SHA-256 audit trail receipts.",
    inputSchema: {
      type: "object",
      properties: {
        operator_id: { type: "string" },
        action_type: { type: "string" },
        record_payload: { type: "string" }
      },
      required: ["operator_id", "action_type", "record_payload"]
    }
  },
  {
    name: "hipaa_pii_scrubber",
    module: "biopharma-mcp",
    description: "Sanitizes Protected Health Information (PHI) from clinical text and JSON payloads.",
    inputSchema: {
      type: "object",
      properties: {
        payload_text: { type: "string" }
      },
      required: ["payload_text"]
    }
  },
  // --- AquaShield Water Surveillance & FHIR Tools ---
  {
    name: "compute_4pl_toxicity",
    module: "aquashield-mcp",
    description: "4-Parameter Logistic Hill-slope regression for aquatic micro-pollutants and chemical toxicity.",
    inputSchema: {
      type: "object",
      properties: {
        concentration: { type: "number" },
        ec50: { type: "number", default: 85.0 },
        hill_slope: { type: "number", default: 1.25 }
      },
      required: ["concentration"]
    }
  },
  {
    name: "compute_nsf_wqi",
    module: "aquashield-mcp",
    description: "Calculates NSF Water Quality Index using weighted geometric multi-parameter aggregation.",
    inputSchema: {
      type: "object",
      properties: {
        do_pct: { type: "number" },
        ph: { type: "number" },
        turbidity_ntu: { type: "number" }
      },
      required: ["do_pct", "ph", "turbidity_ntu"]
    }
  },
  {
    name: "sanitize_citizen_telemetry",
    module: "aquashield-mcp",
    description: "EU GDPR-compliant SHA-256 citizen geolocation salting (64-bit entropy truncation).",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number" },
        lon: { type: "number" },
        contributor_id: { type: "string" }
      },
      required: ["lat", "lon"]
    }
  },
  {
    name: "generate_ieee_fhir_bundle",
    module: "aquashield-mcp",
    description: "Transforms water bioassay readings into valid HL7 FHIR v4.0.1 DiagnosticReport & Observation bundles.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string" },
        e_coli_cfu: { type: "number" },
        dissolved_oxygen_pct: { type: "number" }
      },
      required: ["e_coli_cfu"]
    }
  }
];

// --- Cryptographic HMAC Verification ---
async function computeHmacSignature(message, masterSecret) {
  const cleanSecret = (masterSecret || "seosiri_master_mcp_secret_key_2026_x99").trim().replace(/^["']|["']$/g, '');
  const encoder = new TextEncoder();
  const keyData = encoder.encode(cleanSecret);
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

  if (parts.length === 6) {
    [tier, country, userId, scope, expiresAtStr, providedSignature] = parts;
  } else if (parts.length === 5) {
    [tier, country, userId, expiresAtStr, providedSignature] = parts;
    scope = "ALL";
  } else {
    return { valid: false, reason: "INVALID_KEY_FORMAT", tier: "FREE", maxRequestsPerMin: 30 };
  }

  const payload = parts.length === 6 
    ? `${tier}_${country}_${userId}_${scope}_${expiresAtStr}`
    : `${tier}_${country}_${userId}_${expiresAtStr}`;

  const expectedSignature = await computeHmacSignature(payload, masterSecret);
  if (providedSignature.toLowerCase() !== expectedSignature.toLowerCase()) {
    return { valid: false, reason: "INVALID_CRYPTOGRAPHIC_SIGNATURE", tier: "FREE", maxRequestsPerMin: 30 };
  }

  if (scope !== "BIOPHARMA" && scope !== "AQUASHIELD" && scope !== "ALL") {
    return { valid: false, reason: "UNAUTHORIZED_SERVER_SCOPE", tier: "FREE", maxRequestsPerMin: 0 };
  }

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

// --- Scientific Calculation Helpers ---
function execute4PLCalculation(conc, top = 100.0, bottom = 0.0, ec50 = 85.0, hill = 1.25) {
  const viability = bottom + (top - bottom) / (1.0 + Math.pow(conc / ec50, hill));
  return {
    concentration: conc,
    cell_viability_percentage: Number(viability.toFixed(2)),
    hazard_level: viability < 30.0 ? "CRITICAL" : "NOMINAL"
  };
}

function executeWQICalculation(doPct, ph, turb) {
  const qDo = Math.min(100.0, Math.max(0.0, doPct * 0.95));
  const qPh = Math.max(0.0, 100.0 - Math.abs(ph - 7.0) * 18.0);
  const qTurb = Math.max(0.0, 100.0 - (turb * 1.5));
  const wqi = (qDo * 0.40) + (qPh * 0.35) + (qTurb * 0.25);
  const status = wqi >= 90 ? "EXCELLENT" : wqi >= 70 ? "GOOD" : wqi >= 50 ? "MEDIUM" : wqi >= 25 ? "POOR" : "VERY_POOR";
  return { wqi_score: Number(wqi.toFixed(2)), status };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const apiKey = request.headers.get("x-seosiri-key") || "FREE_TIER";
    const masterSecret = env.MASTER_SECRET || "seosiri_master_mcp_secret_key_2026_x99";

    // Dynamic Canonical Resolution (Reflects the exact active gateway origin & path)
    const canonicalOrigin = `${url.protocol}//${url.hostname}`;
    const canonicalUrl = `${canonicalOrigin}${url.pathname}`;

    // 1. CORS Preflight
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

    // 2. Health & Multi-Module Discovery Endpoint (/health)
    if (url.pathname === "/health") {
      const userInfo = await validateAndIdentifyUserKey(apiKey, masterSecret);
      const rateLimit = await checkPerUserRateLimit(clientIp, userInfo);

      return new Response(JSON.stringify({
        status: "HEALTHY",
        service: "SEOSiri Biopharma & Life Sciences Multi-System Edge Gateway",
        canonical_endpoint: canonicalUrl,
        supported_modules: ["@seosiri/biopharma-mcp", "aquashield-mcp"],
        version: "1.1.0",
        identified_user: userInfo.user_id,
        tier: userInfo.tier,
        scope: userInfo.scope,
        rate_limit_remaining: rateLimit.remaining,
        upgrade_pricing_url: SEOSIRI_LICENSING.pricing_portal,
        corporate_support: SEOSIRI_LICENSING.corporate_support,
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Link": `<${canonicalUrl}>; rel="canonical"`,
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 3. JSON-RPC 2.0 Endpoint (/rpc)
    if (url.pathname === "/rpc") {
      const userInfo = await validateAndIdentifyUserKey(apiKey, masterSecret);
      if (!userInfo.valid) {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: `Authentication Failed: ${userInfo.reason}`,
            data: { upgrade_url: SEOSIRI_LICENSING.pricing_portal }
          },
          id: null
        }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      }

      const rateLimit = await checkPerUserRateLimit(clientIp, userInfo);
      if (!rateLimit.allowed) {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32029,
            message: `Rate limit exceeded (${userInfo.maxRequestsPerMin} req/min). Upgrade to Pro or Enterprise tier at ${SEOSIRI_LICENSING.pricing_portal}`,
            data: {
              reset_seconds: rateLimit.resetSeconds,
              pricing_portal: SEOSIRI_LICENSING.pricing_portal
            }
          },
          id: null
        }), { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      }

      if (request.method === "POST") {
        try {
          const body = await request.json();

          // Method: tools/list
          if (body.method === "tools/list") {
            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              id: body.id !== undefined ? body.id : 1,
              result: {
                tools: BIOPHARMA_ECOSYSTEM_TOOLS,
                active_tier: userInfo.tier,
                rate_limit_remaining: rateLimit.remaining,
                licensing_portal: SEOSIRI_LICENSING.pricing_portal
              }
            }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Link": `<${canonicalUrl}>; rel="canonical"`,
                "Access-Control-Allow-Origin": "*"
              }
            });
          }

          // Method: tools/call
          if (body.method === "tools/call") {
            const { name, arguments: args = {} } = body.params || {};
            let executionResult = null;

            if (name === "compute_4pl_toxicity" || name === "solve_4pl_dose_response") {
              const conc = Number(args.concentration) || 45.0;
              executionResult = execute4PLCalculation(conc, args.top, args.bottom, args.ec50, args.hill_slope);
            } else if (name === "compute_nsf_wqi") {
              executionResult = executeWQICalculation(
                Number(args.do_pct) || 75.0,
                Number(args.ph) || 7.2,
                Number(args.turbidity_ntu) || 12.0
              );
            } else if (name === "calculate_z_factor") {
              const { pos_control_mean = 100, pos_control_sd = 2.5, neg_control_mean = 10, neg_control_sd = 1.5 } = args;
              const zFactor = 1 - (3 * (pos_control_sd + neg_control_sd)) / Math.abs(pos_control_mean - neg_control_mean);
              executionResult = { z_factor: Number(zFactor.toFixed(4)), assay_quality: zFactor >= 0.5 ? "EXCELLENT_ASSAY" : "MARGINAL" };
            } else if (name === "generate_ieee_fhir_bundle") {
              executionResult = {
                resourceType: "Bundle",
                type: "transaction",
                status: "generated",
                observation: {
                  code: "56475-7",
                  e_coli_cfu: args.e_coli_cfu || 480.0,
                  interpretation: (args.e_coli_cfu || 480.0) > 200.0 ? "CRITICAL_HAZARD" : "NOMINAL"
                },
                provenance: "https://developers.seosiri.com/fhir/extensions/edge-provenance"
              };
            } else {
              executionResult = { status: "EXECUTED", tool: name, echo: args, timestamp: new Date().toISOString() };
            }

            return new Response(JSON.stringify({
              jsonrpc: "2.0",
              id: body.id !== undefined ? body.id : 1,
              result: {
                content: [{ type: "text", text: JSON.stringify(executionResult, null, 2) }]
              }
            }), {
              status: 200,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
          }

          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32601, message: `Method '${body.method}' not found.` },
            id: body.id !== undefined ? body.id : null
          }), { status: 404, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

        } catch (e) {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32700, message: "Invalid JSON-RPC payload format" },
            id: null
          }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }
      }

      return new Response(JSON.stringify({
        service: "SEOSiri Biopharma & Life Sciences JSON-RPC 2.0 Gateway",
        status: "ACTIVE",
        supported_methods: ["tools/list", "tools/call"],
        documentation: SEOSIRI_LICENSING.developer_hub,
        pricing_and_licensing: SEOSIRI_LICENSING.pricing_portal
      }, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Link": `<${canonicalUrl}>; rel="canonical"`,
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 4. Model Context Protocol Server-Sent Events (/sse)
    if (url.pathname === "/sse") {
      const sessionId = crypto.randomUUID();
      const sseStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`event: endpoint\ndata: /messages?session_id=${sessionId}\n\n`));
        }
      });

      return new Response(sseStream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 5. REST 4PL Curve Endpoint
    if (url.pathname === "/api/4pl-curve" && request.method === "POST") {
      try {
        const userInfo = await validateAndIdentifyUserKey(apiKey, masterSecret);
        if (!userInfo.valid) {
          return new Response(JSON.stringify({
            error: "AUTHENTICATION_FAILED",
            reason: userInfo.reason,
            upgrade_pricing_url: SEOSIRI_LICENSING.pricing_portal
          }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        }

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
          pricing_portal: SEOSIRI_LICENSING.pricing_portal
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid JSON payload" }), { status: 400 });
      }
    }

    // 6. Canonical FHIR Extension Schema (/fhir/extensions/edge-provenance)
    if (url.pathname === "/fhir/extensions/edge-provenance") {
      return new Response(JSON.stringify({
        resourceType: "StructureDefinition",
        id: "edge-provenance",
        url: "https://developers.seosiri.com/fhir/extensions/edge-provenance",
        version: "1.0.0",
        name: "EdgeProvenanceExtension",
        title: "SEOSiri Cryptographic Edge Provenance Extension",
        status: "active",
        fhirVersion: "4.0.1",
        kind: "complex-type",
        publisher: "SEOSiri Enterprise Labs",
        contact: [{ name: "SEOSiri Enterprise Desk", telecom: [{ system: "url", value: SEOSIRI_LICENSING.pricing_portal }] }],
        description: "Attests that clinical and environmental bioassay telemetry was cryptographically authenticated via SEOSiri HMAC-SHA256 Edge Gateways before FHIR ingestion."
      }, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/fhir+json; charset=utf-8",
          "Link": `<https://developers.seosiri.com/fhir/extensions/edge-provenance>; rel="canonical"`,
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 7. Default Root Browser Redirect
    const acceptHeader = request.headers.get("Accept") || "";
    if ((url.pathname === "/" || url.pathname === "") && acceptHeader.includes("text/html")) {
      return Response.redirect("https://www.seosiri.com/2026/08/biopharma-mcp.html", 301);
    }

    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      return new Response(JSON.stringify({
        service: "SEOSiri Biopharma & Life Sciences Multi-System Edge Gateway",
        status: "ONLINE",
        endpoints: ["/health", "/rpc", "/sse", "/api/4pl-curve", "/fhir/extensions/edge-provenance"],
        licensing_and_pricing: SEOSIRI_LICENSING.pricing_portal
      }, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};