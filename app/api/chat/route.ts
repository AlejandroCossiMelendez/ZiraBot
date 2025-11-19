import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { ollama } from '@/lib/ollama';
import { validateToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    // Verificar autenticación (Token Bearer o sesión interna)
    const authHeader = request.headers.get('Authorization');
    let companyId: number | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const company = await validateToken(token);
      if (!company) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
      companyId = company.id;
    }

    const body = await request.json();
    const { bot_id, message, session_id } = body;

    if (!bot_id || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Obtener configuración del bot
    const bot = await queryOne('SELECT * FROM bots WHERE id = ?', [bot_id]);
    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // Verificar que el bot pertenece a la empresa (si se usa token)
    if (companyId && bot.company_id !== companyId) {
      return NextResponse.json({ error: 'Unauthorized access to this bot' }, { status: 403 });
    }

    // Gestionar sesión de conversación
    let conversationId: number;
    const currentSessionId = session_id || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (session_id) {
      const conversation = await queryOne(
        'SELECT id FROM conversations WHERE session_id = ? AND bot_id = ?',
        [session_id, bot_id]
      );
      
      if (conversation) {
        conversationId = conversation.id;
      } else {
        const result = await query(
          'INSERT INTO conversations (bot_id, session_id) VALUES (?, ?)',
          [bot_id, currentSessionId]
        );
        conversationId = (result as any).insertId;
      }
    } else {
      const result = await query(
        'INSERT INTO conversations (bot_id, session_id) VALUES (?, ?)',
        [bot_id, currentSessionId]
      );
      conversationId = (result as any).insertId;
    }

    // Guardar mensaje del usuario
    await query(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)",
      [conversationId, message]
    );

    // Obtener historial reciente para contexto (últimos 10 mensajes)
    // IMPORTANTE: Ordenar por DESC para obtener los mensajes más recientes
    const history = await query(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10",
      [conversationId]
    );
    
    // Revertir el orden para mantener la secuencia cronológica correcta (más antiguo primero)
    history.reverse();

    // Verificar si el bot usa un modelo personalizado (con system prompt incorporado)
    const usingCustomModel = !!bot.custom_model_name;
    const modelToUse = bot.custom_model_name || bot.model;
    
    // Filtrar el historial para excluir mensajes system previos y mantener solo user/assistant
    const conversationHistory = history
      .filter((msg: any) => msg.role !== 'system')
      .map((msg: any) => ({ role: msg.role, content: msg.content }));
    
    // Preparar system prompt del bot
    const systemPrompt = bot.system_prompt || 'You are a helpful assistant.';
    
    // Verificar si estamos usando API directa de Ollama (mismo servidor)
    // Si es así y tenemos modelo personalizado, confiar en el Modelfile
    const config = ollama.getConfig();
    const shouldUseModelfileOnly = usingCustomModel && config.useDirectOllama;
    
    // Si usamos modelo personalizado en API directa, confiar solo en Modelfile
    // Si usamos Open WebUI o modelo normal, siempre enviar system prompt
    const ollamaMessages = shouldUseModelfileOnly
      ? conversationHistory // Solo historial, el Modelfile tiene el system prompt
      : [
          { role: 'system', content: systemPrompt },
          ...conversationHistory
        ];

    // Log de configuración en desarrollo
    if (process.env.NODE_ENV !== 'production') {
      console.log('💬 Chat Request:');
      console.log('  Bot ID:', bot_id);
      console.log('  Model:', modelToUse);
      console.log('  Custom Model:', usingCustomModel ? `✅ YES ${shouldUseModelfileOnly ? '(Modelfile only)' : '(with explicit system)'}` : '❌ NO');
      console.log('  Using Direct Ollama:', config.useDirectOllama ? '✅ YES (Same Server)' : '❌ NO');
      console.log('  API:', config.useDirectOllama ? '🦙 Direct Ollama' : (config.isOpenWebUI ? '🌐 Open WebUI (Cloud)' : '🦙 Local Ollama'));
      console.log('  Base URL:', config.baseUrl);
      console.log('  Messages count:', ollamaMessages.length);
      console.log('  History messages:', conversationHistory.length);
      console.log('  Using Modelfile only:', shouldUseModelfileOnly ? '✅ YES' : '❌ NO');
    }

    // Generar respuesta con Ollama
    // Convertir valores numéricos a números (pueden venir como strings desde la DB)
    const temperature = typeof bot.temperature === 'string' 
      ? parseFloat(bot.temperature) 
      : (bot.temperature ?? 0.7);
    const maxTokens = typeof bot.max_tokens === 'string'
      ? parseInt(bot.max_tokens, 10)
      : (bot.max_tokens ?? 2000);

    // Si usamos modelo personalizado en API directa, skipSystemPrompt=true para usar solo Modelfile
    // De lo contrario, siempre enviar system prompt
    const response = await ollama.generate({
      model: modelToUse,
      messages: ollamaMessages as any,
      options: {
        temperature: temperature,
        num_predict: maxTokens
      }
    }, shouldUseModelfileOnly); // Usar Modelfile solo si estamos en API directa con modelo personalizado

    const assistantMessage = response.message?.content || '';

    // Guardar respuesta del asistente
    await query(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)",
      [conversationId, assistantMessage]
    );

    return NextResponse.json({
      response: assistantMessage,
      session_id: currentSessionId,
      model: bot.model
    });

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Error processing chat request' }, { status: 500 });
  }
}
