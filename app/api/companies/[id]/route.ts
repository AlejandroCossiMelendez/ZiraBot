import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const company = await queryOne('SELECT * FROM companies WHERE id = ?', [id]);
    
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    return NextResponse.json(company);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching company' }, { status: 500 });
  }
}
