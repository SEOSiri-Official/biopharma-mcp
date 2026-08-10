import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const getCorsMiddleware = () => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['https://biopharma.seosiri.com', 'https://developers.seosiri.com', 'https://seosiri.com'];

  return cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error(`CORS Policy Violation: Origin ${origin} blocked by SEOSiri Security Layer.`));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-seosiri-key', 'Mcp-Method', 'Mcp-Name'],
    credentials: true
  });
};

export interface AuthenticatedRequest extends Request {
  user?: string | jwt.JwtPayload;
}

export const authenticateJwtBearer = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (process.env.MCP_TRANSPORT === 'stdio' || req.path === '/health') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Cryptographic JWT Bearer Token required. Visit https://biopharma.seosiri.com for access.'
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const jwtSecret = process.env.JWT_SECRET || 'seosiri_default_biopharma_secret_key_2026';

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({
      error: 'FORBIDDEN_TOKEN_INVALID',
      message: 'JWT token verification failed or expired.'
    });
  }
};

const PII_PATTERNS = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  dob: /\b(0[1-9]|1[0-2])[\/.-](0[1-9]|[12]\d|3[01])[\/.-](19|20)\d{2}\b/g,
  phone: /\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g
};

export function redactPatientPii<T>(data: T): T {
  if (typeof data === 'string') {
    let sanitized = data;
    sanitized = sanitized.replace(PII_PATTERNS.ssn, '[REDACTED_SSN]');
    sanitized = sanitized.replace(PII_PATTERNS.email, '[REDACTED_EMAIL]');
    sanitized = sanitized.replace(PII_PATTERNS.dob, '[REDACTED_DOB]');
    sanitized = sanitized.replace(PII_PATTERNS.phone, '[REDACTED_PHONE]');
    return sanitized as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactPatientPii(item)) as unknown as T;
  }

  if (data !== null && typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (['ssn', 'email', 'dob', 'date_of_birth', 'patient_name', 'phone'].includes(key.toLowerCase())) {
        sanitizedObj[key] = '[REDACTED_SENSITIVE_FIELD]';
      } else {
        sanitizedObj[key] = redactPatientPii(value);
      }
    }
    return sanitizedObj as T;
  }

  return data;
}
