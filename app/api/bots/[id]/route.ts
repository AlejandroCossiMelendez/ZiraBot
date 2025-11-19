import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { ollama } from '@/lib/ollama';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bot = await queryOne(`
      SELECT b.*, c.name as company_name 
      FROM bots b 
      JOIN companies c ON b.company_id = c.id 
      WHERE b.id = ?
    `, [id]);
    
    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    return NextResponse.json(bot);
  } catch (error) {
    return NextResponse.json({ error: 'Error fetching bot' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, model, system_prompt, temperature, max_tokens, status } = body;

    // Obtener el bot actual para verificar el modelo personalizado anterior
    const currentBot = await queryOne('SELECT * FROM bots WHERE id = ?', [id]);
    
    if (!currentBot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Generar nuevo nombre del modelo personalizado
    const customModelName = ollama.generateModelName(currentBot.company_id, name);
    
    // Si había un modelo personalizado anterior y cambió el nombre o system_prompt, eliminarlo
    if (currentBot.custom_model_name && currentBot.custom_model_name !== customModelName) {
      await ollama.deleteCustomModel(currentBot.custom_model_name);
    }
    
    // Crear/actualizar el modelo personalizado en Ollama si hay system_prompt
    if (system_prompt && system_prompt.trim()) {
      const createResult = await ollama.createCustomModel(customModelName, model, system_prompt);
      
      if (!createResult.success) {
        console.error('Error creating/updating custom model:', createResult.error);
        // No fallar la actualización del bot
      }
    } else {
      // Si se eliminó el system_prompt, eliminar el modelo personalizado si existe
      if (currentBot.custom_model_name) {
        await ollama.deleteCustomModel(currentBot.custom_model_name);
      }
    }

    // Determinar qué modelo usar
    const modelToUse = system_prompt && system_prompt.trim() ? customModelName : model;

    await query(
      `UPDATE bots 
       SET name = ?, description = ?, model = ?, custom_model_name = ?, system_prompt = ?, temperature = ?, max_tokens = ?, status = ?
       WHERE id = ?`,
      [name, description, model, modelToUse, system_prompt, temperature, max_tokens, status, id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating bot:', error);
    return NextResponse.json({ error: 'Error updating bot' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Obtener el bot para eliminar el modelo personalizado si existe
    const bot = await queryOne('SELECT * FROM bots WHERE id = ?', [id]);
    
    if (bot && bot.custom_model_name) {
      await ollama.deleteCustomModel(bot.custom_model_name);
    }
    
    await query('DELETE FROM bots WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting bot:', error);
    return NextResponse.json({ error: 'Error deleting bot' }, { status: 500 });
  }
}
