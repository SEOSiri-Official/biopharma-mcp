# @seosiri/biopharma-mcp

[![SEOSiri Biopharma MCP Server on Glama](https://glama.ai/mcp/servers/SEOSiri-Official/biopharma-mcp/badges/score.svg)](https://glama.ai/mcp/servers/SEOSiri-Official/biopharma-mcp)

> 📖 **Official Architecture & Documentation:** [SEOSiri Biopharma Technical Guide](https://www.seosiri.com/2026/08/biopharma-mcp.html) | [Developer Portal & Graph Explorer](https://developers.seosiri.com/) | [Central MCP Directory](https://www.seosiri.com/2026/07/seosiri-mcp-servers.html)

An open-source, local-first Model Context Protocol (MCP) server written in TypeScript for **Biopharma Software Infrastructure, FDA 21 CFR Part 11 GxP Audit Trailing, CDISC SDTM/Allotrope Data Exports, 4PL Dose-Response Curve Fitting, and HIPAA PII/PHI Redaction**.

---

## 🛡️ Enterprise Compliance & Regulatory Clauses

### 1. FDA 21 CFR Part 11 Audit Trail Clause
All operational tool executions generate an immutable SHA-256 cryptographic digest written directly to the `stderr` stream (`generate_gxp_audit_log`). This preserves audit trail integrity, operator identification, and timestamp sequence rules without altering the standard JSON-RPC data payload.

### 2. HIPAA PII/PHI Privacy Redaction Clause
Every data payload passed through memory is automatically processed by a zero-latency privacy cleaning loop (`redactPatientPii`). Common sensitive patient identifiers—including Social Security Numbers (SSN), email addresses, Date of Birth (DOB) strings, and telephone patterns—are redacted prior to memory serialization or cloud database pooling.

### 3. Data-at-Rest AES-256-GCM Encryption Clause
Database connection parameters and sensitive data fields stored in cloud instances are encrypted using AES-256-GCM blocks with random 12-byte initialization vectors (IVs) and authentication tags (`encryptRestData` / `decryptRestData`).

---

## 🚀 10 Zod-Validated Production Tools

1. **`calculate_4pl_curve`**: Fits 4-Parameter Logistic non-linear regression sigmoidal dose-response curves.
2. **`assess_parallelism`**: Computes shared slope and asymptotes consistency via F-Test and TOST equivalence metrics.
3. **`calculate_z_factor`**: Validates microplate high-throughput screening (HTS) quality from positive and negative control series.
4. **`parse_large_plate_stream`**: Memory-safe stream parser for 96-well or 384-well microplate layout string rows.
5. **`resolve_biological_entity_safe`**: Fault-tolerant Circuit Breaker container for ChEBI and PubChem compound queries.
6. **`detect_assay_outliers`**: Grubbs and IQR mathematical filtering boundaries to detect and drop anomalous microplate artifacts.
7. **`calculate_lod_loq`**: Calculates Limit of Detection (LOD) and Limit of Quantitation (LOQ) from background blank deviations.
8. **`normalize_dilution_potency`**: Scales observed target calculations dynamically across complex serial dilution ratios.
9. **`export_cdisc_sdtm`**: Converts internal JSON records into CDISC SDTM v1.7 / Allotrope Data Model compliant structural models.
10. **`generate_gxp_audit_log`**: Records immutably hashed operation logs to maintain compliance with FDA 21 CFR Part 11.

---

## 📦 Installation & Setup Guide

### 1. Install via NPM / NPX
```bash
# Global installation
npm install -g @seosiri/biopharma-mcp

# Local project installation
npm install @seosiri/biopharma-mcp
```

### 2. Build and Test Locally
```bash
# Compile TypeScript to ESM (dist/index.js)
npm run build

# Run unit test suite
npm test
```

---

## 🔌 AI Host Client Integrations

### Claude Desktop Setup
Add this to your `claude_desktop_config.json` file:
```json
{
  "mcpServers": {
    "seosiri-biopharma": {
      "command": "node",
      "args": [
        "D:/biopharma-mcp/dist/index.js"
      ]
    }
  }
}
```

### Cursor IDE Setup
Add this to your `mcp.json` file or configure it directly in the IDE settings:
```json
{
  "mcpServers": {
    "seosiri-biopharma": {
      "command": "npx",
      "args": [
        "-y",
        "@seosiri/biopharma-mcp"
      ]
    }
  }
}
```

---

## 💖 Sponsorship, B2B Custom Solutions & Attribution

### Lead Architect
Designed and engineered by Momenul Ahmad, Lead Architect and Founder of SEOSiri.

### Enterprise B2B Custom Development
SEOSiri provides high-ticket systems architecture, custom biopharma MCP tool engineering, and Cloudflare Zero Trust gateway integration for corporate clients in the United States, United Kingdom, Canada, Germany, and Japan.

* **Official Portal:** [developers.seosiri.com](https://developers.seosiri.com/)
* **Corporate Support Email:** info@seosiri.com
* **GitHub Sponsors:** Sponsor SEOSiri-Official on GitHub

#
## 💼 Commercial Licensing & High-Throughput API Keys

Need more than 30 requests/minute for production?
- **Free Tier:** 30 req/min (Default, public).
- **Pro Tier ($299/mo):** 1,000 req/min across all edge gateways with signed API key.
- **Enterprise ($2,500):** Dedicated Cloudflare Zero Trust VPC, custom MCP tools, and SLA support.
- **Payment Method:** Payoneer (`badhan_pbn@yahoo.com`) or direct wire.
- **Developer Portal:** [developers.seosiri.com](https://developers.seosiri.com/) | **Contact Desk:** `info@seosiri.com`

## License
Distributed under the [MIT License](https://github.com/SEOSiri-Official/biopharma-mcp/blob/main/LICENSE).