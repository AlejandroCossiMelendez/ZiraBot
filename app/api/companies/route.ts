import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const companies = await query('SELECT * FROM companies ORDER BY created_at DESC');
    return NextResponse.json(companies);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching companies' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, email } = await request.json();
    
    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    const result = await query(
      'INSERT INTO companies (name, email) VALUES (?, ?)',
      [name, email]
    );

    const newCompany = await query('SELECT * FROM companies WHERE id = ?', [(result as any).insertId]);
    
    return NextResponse.json(newCompany[0], { status: 201 });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Error creating company' }, { status: 500 });
  }
}
