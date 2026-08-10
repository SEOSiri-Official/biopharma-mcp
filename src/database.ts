import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

export const postgresPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/biopharma_db',
  max: parseInt(process.env.PG_MAX_CLIENTS || '20', 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.PG_CONN_TIMEOUT || '5000', 10),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
});

const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.ENCRYPTION_SECRET || 'seosiri_biopharma_aes_master_key_2026',
  'seosiri_salt',
  32
);

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encryptRestData(plaintext: string): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag
  };
}

export function decryptRestData(payload: EncryptedPayload): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(payload.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));

  let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
