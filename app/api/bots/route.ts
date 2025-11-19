import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { ollama } from '@/lib/ollama';

export async function GET() {
  try {
    const bots = await query(`
      SELECT b.*, c.name as company_name 
      FROM bots b 
      JOIN companies c ON b.company_id = c.id 
      ORDER BY b.created_at DESC
    `);
    return NextResponse.json(bots);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching bots' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { company_id, name, description, model, system_prompt, temperature, max_tokens } = body;

    if (!company_id || !name || !model) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generar nombre del modelo personalizado
    const customModelName = ollama.generateModelName(company_id, name);
    
    // Crear el modelo personalizado en Ollama si hay system_prompt
    if (system_prompt && system_prompt.trim()) {
      const createResult = await ollama.createCustomModel(customModelName, model, system_prompt);
      
      if (createResult.success) {
        // Verificar que el modelo se creó correctamente
        const modelfileCheck = await ollama.getModelModelfile(customModelName);
        if (modelfileCheck.success && process.env.NODE_ENV !== 'production') {
          console.log('✅ Model created successfully. Modelfile:', modelfileCheck.modelfile?.substring(0, 200));
        } else if (!modelfileCheck.success && process.env.NODE_ENV !== 'production') {
          console.warn('⚠️ Could not verify model modelfile:', modelfileCheck.error);
        }
      } else {
        console.error('Error creating custom model:', createResult.error);
        // No fallar la creación del bot, solo loguear el error
        // El bot puede usar el modelo base sin personalización
      }
    }

    // Guardar el bot con el nombre del modelo personalizado (si se creó) o el modelo base
    const modelToUse = system_prompt && system_prompt.trim() ? customModelName : model;
    
    const result = await query(
      `INSERT INTO bots (company_id, name, description, model, custom_model_name, system_prompt, temperature, max_tokens) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [company_id, name, description, model, modelToUse, system_prompt, temperature || 0.7, max_tokens || 2000]
    );

    const newBot = await queryOne('SELECT * FROM bots WHERE id = ?', [(result as any).insertId]);
    
    return NextResponse.json(newBot, { status: 201 });
  } catch (error) {
    console.error('Error creating bot:', error);
    return NextResponse.json({ error: 'Error creating bot' }, { status: 500 });
  }
}
