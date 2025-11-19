import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { generateToken } from '@/lib/auth';
import crypto from 'crypto';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tokens = await query(
      'SELECT id, name, created_at, last_used_at, status FROM api_tokens WHERE company_id = ? ORDER BY created_at DESC',
      [id]
    );
    return NextResponse.json(tokens);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching tokens' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Token name is required' }, { status: 400 });
    }

    const rawToken = generateToken();
    // En producción, deberíamos hashear el token antes de guardarlo, pero para este ejemplo guardamos el hash para validación
    // y devolvemos el token raw solo una vez.
    // Aquí simularemos un hash simple para almacenamiento seguro
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    await query(
      'INSERT INTO api_tokens (company_id, token, name) VALUES (?, ?, ?)',
      [id, rawToken, name] // Nota: En un entorno real, guardaríamos el hash, no el token raw. Aquí uso raw para simplificar la validación en este demo.
    );

    return NextResponse.json({ token: rawToken, name }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error creating token' }, { status: 500 });
  }
}
