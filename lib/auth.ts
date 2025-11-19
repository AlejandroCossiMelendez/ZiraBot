import { query, queryOne } from './db';
import crypto from 'crypto';

export interface Company {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  created_at: Date;
}

export interface ApiToken {
  id: number;
  company_id: number;
  token: string;
  name: string;
  status: 'active' | 'revoked';
  created_at: Date;
  last_used_at?: Date;
  expires_at?: Date;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function validateToken(token: string): Promise<Company | null> {
  const result = await queryOne<Company & ApiToken>(
    `SELECT c.*, t.id as token_id 
     FROM api_tokens t 
     JOIN companies c ON t.company_id = c.id 
     WHERE t.token = ? AND t.status = 'active' AND c.status = 'active'`,
    [token]
  );

  if (result) {
    // Actualizar last_used_at
    await query(
      'UPDATE api_tokens SET last_used_at = NOW() WHERE token = ?',
      [token]
    );
  }

  return result;
}

export async function getCompanyFromToken(token: string): Promise<Company | null> {
  return validateToken(token);
}
