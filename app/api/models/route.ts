import { NextResponse } from 'next/server';
import { ollama } from '@/lib/ollama';

export async function GET() {
  try {
    const { models } = await ollama.listModels();
    return NextResponse.json(models);
  } catch (error) {
    console.error('Error fetching models:', error);
    // Fallback si Ollama no responde o no hay modelos
    return NextResponse.json([
      { name: 'deepseek-coder-v2:latest', size: 8900000000, modified_at: new Date().toISOString() },
      { name: 'llama3.2:1b', size: 1300000000, modified_at: new Date().toISOString() }
    ]);
  }
}
