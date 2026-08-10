import dotenv from 'dotenv';
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { getCorsMiddleware, authenticateJwtBearer } from './security.js';
import {
  calculate4plSchema, solve4plCurve,
  assessParallelismSchema, solveParallelism,
  calculateZFactorSchema, solveZFactor,
  parsePlateStreamSchema, solveParsePlateStream,
  resolveEntitySchema, solveResolveEntity,
  detectOutliersSchema, solveDetectOutliers,
  calculateLodLoqSchema, solveCalculateLodLoq,
  normalizeDilutionSchema, solveNormalizeDilution,
  exportCdiscSdtmSchema, solveExportCdiscSdtm,
  generateGxpAuditLogSchema, solveGenerateGxpAuditLog
} from './tools.js';

dotenv.config();

const mcpServer = new Server(
  {
    name: 'SEOSiri-Biopharma-Infrastructure-Server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'calculate_4pl_curve',
      description: 'Fits and resolves 4-Parameter Logistic non-linear regression sigmoidal dose-response fields.',
      inputSchema: {
        type: 'object',
        properties: {
          concentrations: { type: 'array', items: { type: 'number' } },
          responses: { type: 'array', items: { type: 'number' } }
        },
        required: ['concentrations', 'responses']
      }
    },
    {
      name: 'assess_parallelism',
      description: 'Computes shared slope and asymptotes consistency via F-Test and TOST metrics.',
      inputSchema: {
        type: 'object',
        properties: {
          reference_responses: { type: 'array', items: { type: 'number' } },
          test_responses: { type: 'array', items: { type: 'number' } }
        },
        required: ['reference_responses', 'test_responses']
      }
    },
    {
      name: 'calculate_z_factor',
      description: 'Validates microplate HTS metrics from positive and negative control data series.',
      inputSchema: {
        type: 'object',
        properties: {
          positive_controls: { type: 'array', items: { type: 'number' } },
          negative_controls: { type: 'array', items: { type: 'number' } }
        },
        required: ['positive_controls', 'negative_controls']
      }
    },
    {
      name: 'parse_large_plate_stream',
      description: 'Memory-safe stream parser for 96-well or 384-well microplate layout string rows.',
      inputSchema: {
        type: 'object',
        properties: {
          plate_layout_csv: { type: 'string' },
          format_wells: { type: 'string', enum: ['96', '384'] }
        },
        required: ['plate_layout_csv']
      }
    },
    {
      name: 'resolve_biological_entity_safe',
      description: 'Fault-tolerant Circuit Breaker query for ChEBI or PubChem compound resolution.',
      inputSchema: {
        type: 'object',
        properties: {
          compound_name: { type: 'string' },
          target_database: { type: 'string', enum: ['PUBCHEM', 'CHEBI'] }
        },
        required: ['compound_name']
      }
    },
    {
      name: 'detect_assay_outliers',
      description: 'Employs Grubbs and IQR mathematical boundaries to filter anomalous microplate artifacts.',
      inputSchema: {
        type: 'object',
        properties: {
          replicate_values: { type: 'array', items: { type: 'number' } },
          method: { type: 'string', enum: ['GRUBBS', 'IQR'] }
        },
        required: ['replicate_values']
      }
    },
    {
      name: 'calculate_lod_loq',
      description: 'Calculates Limit of Detection (LOD) and Limit of Quantitation (LOQ) from background blanks.',
      inputSchema: {
        type: 'object',
        properties: {
          blank_responses: { type: 'array', items: { type: 'number' } },
          slope: { type: 'number' }
        },
        required: ['blank_responses', 'slope']
      }
    },
    {
      name: 'normalize_dilution_potency',
      description: 'Scales observed calculations dynamically across dilution ratios back to original stock concentration.',
      inputSchema: {
        type: 'object',
        properties: {
          observed_concentration: { type: 'number' },
          dilution_factor: { type: 'number' }
        },
        required: ['observed_concentration', 'dilution_factor']
      }
    },
    {
      name: 'export_cdisc_sdtm',
      description: 'Converts unstructured JSON payload records into CDISC SDTM / Allotrope compliant models.',
      inputSchema: {
        type: 'object',
        properties: {
          study_id: { type: 'string' },
          subject_id: { type: 'string' },
          test_code: { type: 'string' },
          numeric_result: { type: 'number' },
          result_unit: { type: 'string' }
        },
        required: ['study_id', 'subject_id', 'test_code', 'numeric_result', 'result_unit']
      }
    },
    {
      name: 'generate_gxp_audit_log',
      description: 'Records immutably hashed operation logs to maintain compliance with FDA 21 CFR Part 11.',
      inputSchema: {
        type: 'object',
        properties: {
          operator_id: { type: 'string' },
          action_performed: { type: 'string' },
          resource_target: { type: 'string' }
        },
        required: ['operator_id', 'action_performed', 'resource_target']
      }
    }
  ]
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'calculate_4pl_curve': {
        const validated = calculate4plSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solve4plCurve(validated)) }] };
      }
      case 'assess_parallelism': {
        const validated = assessParallelismSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solveParallelism(validated)) }] };
      }
      case 'calculate_z_factor': {
        const validated = calculateZFactorSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solveZFactor(validated)) }] };
      }
      case 'parse_large_plate_stream': {
        const validated = parsePlateStreamSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solveParsePlateStream(validated)) }] };
      }
      case 'resolve_biological_entity_safe': {
        const validated = resolveEntitySchema.parse(args);
        const res = await solveResolveEntity(validated);
        return { content: [{ type: 'text', text: JSON.stringify(res) }] };
      }
      case 'detect_assay_outliers': {
        const validated = detectOutliersSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solveDetectOutliers(validated)) }] };
      }
      case 'calculate_lod_loq': {
        const validated = calculateLodLoqSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solveCalculateLodLoq(validated)) }] };
      }
      case 'normalize_dilution_potency': {
        const validated = normalizeDilutionSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solveNormalizeDilution(validated)) }] };
      }
      case 'export_cdisc_sdtm': {
        const validated = exportCdiscSdtmSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solveExportCdiscSdtm(validated)) }] };
      }
      case 'generate_gxp_audit_log': {
        const validated = generateGxpAuditLogSchema.parse(args);
        return { content: [{ type: 'text', text: JSON.stringify(solveGenerateGxpAuditLog(validated)) }] };
      }
      default:
        throw new Error(`Tool '${name}' is not recognized in SEOSiri Biopharma Registry.`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ status: 'ERROR', error: error.message || String(error) }) }]
    };
  }
});

async function runServer() {
  const transportMode = process.env.MCP_TRANSPORT || 'stdio';

  if (transportMode === 'sse') {
    const app = express();
    const port = parseInt(process.env.PORT || '8000', 10);

    app.use(getCorsMiddleware());
    app.use(express.json());
    app.use(authenticateJwtBearer as express.RequestHandler);

    let sseTransport: SSEServerTransport | null = null;

    app.get('/health', (_req, res) => {
      res.json({
        status: 'HEALTHY',
        service: 'SEOSiri Biopharma MCP Server',
        version: '1.0.0',
        transport: 'SSE',
        timestamp: new Date().toISOString()
      });
    });

    app.get('/sse', async (req, res) => {
      sseTransport = new SSEServerTransport('/messages', res);
      await mcpServer.connect(sseTransport);
    });

    app.post('/messages', async (req, res) => {
      if (sseTransport) {
        await sseTransport.handlePostMessage(req, res);
      } else {
        res.status(400).json({ error: 'SSE_SESSION_NOT_INITIALIZED' });
      }
    });

    app.listen(port, () => {
      console.error(`[SEOSiri Biopharma MCP] Live over SSE on port ${port}`);
    });
  } else {
    const stdioTransport = new StdioServerTransport();
    await mcpServer.connect(stdioTransport);
    console.error('[SEOSiri Biopharma MCP] Running on local stdio transport.');
  }
}

runServer().catch(err => {
  console.error('[SEOSiri Biopharma MCP Error]:', err);
  process.exit(1);
});
