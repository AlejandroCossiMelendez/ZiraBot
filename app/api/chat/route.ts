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

    // Obtener historial reciente para contexto (últimos 5 mensajes para reducir tiempo de respuesta)
    // IMPORTANTE: Ordenar por DESC para obtener los mensajes más recientes
    // Reducido de 10 a 5 para acelerar el procesamiento
    const history = await query(
      "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 5",
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
    
    // Preparar system prompt del bot con instrucciones MUY estrictas
    const baseSystemPrompt = bot.system_prompt || 'You are a helpful assistant.';
    
    // Extraer el tema principal del conocimiento para usar en las respuestas
    const knowledgeTopic = baseSystemPrompt.includes('tecnología') || baseSystemPrompt.includes('desarrollo') || baseSystemPrompt.includes('software')
      ? 'tecnología, desarrollo de software y arquitectura de sistemas'
      : 'el tema del conocimiento proporcionado';
    
    const systemPrompt = bot.system_prompt 
      ? `⚠️ ADVERTENCIA CRÍTICA: ESTAS INSTRUCCIONES SON ABSOLUTAS Y NO NEGOCIABLES ⚠️

REGLA FUNDAMENTAL #1: SOLO puedes usar la información del "CONOCIMIENTO PROPORCIONADO" que aparece más abajo.
REGLA FUNDAMENTAL #2: NUNCA uses tu conocimiento general, entrenamiento previo, o cualquier información que no esté explícitamente en el "CONOCIMIENTO PROPORCIONADO".

INSTRUCCIONES ABSOLUTAS:
1. Si te preguntan algo que NO está en el "CONOCIMIENTO PROPORCIONADO", DEBES responder EXACTAMENTE: "No tengo información sobre eso en mi conocimiento proporcionado. Solo puedo responder preguntas relacionadas con ${knowledgeTopic}."

2. NUNCA respondas preguntas sobre:
   - Matemáticas básicas (a menos que esté en el conocimiento proporcionado)
   - Historia, filosofía, acertijos, chistes
   - Cualquier tema que NO esté mencionado en el "CONOCIMIENTO PROPORCIONADO"
   - Información general que aprendiste durante tu entrenamiento

3. Si la pregunta está relacionada con el conocimiento proporcionado, responde SOLO con esa información.

4. Si la pregunta NO está relacionada, responde: "No tengo información sobre eso en mi conocimiento proporcionado."

EJEMPLOS DE RESPUESTAS CORRECTAS:
- Pregunta: "¿Cuánto es 5x5?" → Respuesta: "No tengo información sobre operaciones matemáticas básicas en mi conocimiento proporcionado. Solo puedo responder preguntas relacionadas con ${knowledgeTopic}."
- Pregunta: "¿Qué fue primero el huevo o la gallina?" → Respuesta: "No tengo información sobre ese tema en mi conocimiento proporcionado. Solo puedo responder preguntas relacionadas con ${knowledgeTopic}."

CONOCIMIENTO PROPORCIONADO (ÚNICA FUENTE DE INFORMACIÓN PERMITIDA):
${baseSystemPrompt}

⚠️ RECORDATORIO FINAL: Si la pregunta NO está relacionada con el "CONOCIMIENTO PROPORCIONADO" de arriba, responde que no tienes información. NUNCA uses conocimiento general.`
      : 'You are a helpful assistant. Only respond based on the information explicitly provided to you. If you do not have information about something, clearly state "I do not have information about that" or "I do not know".';
    
    // IMPORTANTE: Siempre enviar el system prompt explícitamente
    // Aunque ahora usamos el comando `ollama create` directamente (que aplica correctamente el SYSTEM),
    // enviamos el system prompt explícitamente en cada petición como respaldo para garantizar que siempre se aplique
    const config = ollama.getConfig();
    
    // Siempre incluir el system prompt en los mensajes
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory
    ];

    // Log de configuración (siempre en desarrollo, o si ENABLE_LOGS está habilitado)
    const shouldLog = process.env.NODE_ENV !== 'production' || process.env.ENABLE_LOGS === 'true';
    if (shouldLog) {
      console.log('💬 Chat Request:');
      console.log('  Bot ID:', bot_id);
      console.log('  Model:', modelToUse);
      console.log('  Custom Model:', usingCustomModel ? '✅ YES (using explicit system prompt)' : '❌ NO');
      console.log('  Using Direct Ollama:', config.useDirectOllama ? '✅ YES (Same Server)' : '❌ NO');
      console.log('  API:', config.useDirectOllama ? '🦙 Direct Ollama' : (config.isOpenWebUI ? '🌐 Open WebUI (Cloud)' : '🦙 Local Ollama'));
      console.log('  Base URL:', config.baseUrl);
      console.log('  Messages count:', ollamaMessages.length);
      console.log('  History messages:', conversationHistory.length);
      console.log('  System prompt (first 200 chars):', systemPrompt.substring(0, 200));
    }

    // Generar respuesta con Ollama
    // Convertir valores numéricos a números (pueden venir como strings desde la DB)
    // Usar temperatura más baja por defecto (0.3) para respuestas más deterministas y controladas
    const temperature = typeof bot.temperature === 'string' 
      ? parseFloat(bot.temperature) 
      : (bot.temperature ?? 0.3);
    
    // Calcular max_tokens de forma inteligente
    // Si el usuario configuró un valor muy bajo (< 500), aumentarlo automáticamente para evitar respuestas cortadas
    // Esto balancea velocidad con completitud de respuestas
    let maxTokens = typeof bot.max_tokens === 'string'
      ? parseInt(bot.max_tokens, 10)
      : (bot.max_tokens ?? 500);
    
    // Si max_tokens es muy bajo, aumentarlo automáticamente para evitar respuestas cortadas
    // 500 es un buen balance entre velocidad y completitud
    if (maxTokens < 500) {
      if (shouldLog) {
        console.log(`⚠️ max_tokens (${maxTokens}) es muy bajo, aumentando a 500 para evitar respuestas cortadas`);
      }
      maxTokens = 500;
    }

    // Siempre enviar el system prompt explícitamente (no confiar en Modelfile)
    // skipSystemPrompt=false para que siempre se incluya el system prompt en los mensajes
    const response = await ollama.generate({
      model: modelToUse,
      messages: ollamaMessages as any,
      options: {
        temperature: temperature,
        num_predict: maxTokens
      }
    }, false); // Siempre false - siempre enviar system prompt explícitamente

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

  } catch (error: any) {
    console.error('Chat error:', error);
    const errorMessage = error.message || 'Error processing chat request';
    return NextResponse.json({ 
      error: errorMessage.includes('timeout') || errorMessage.includes('tardó demasiado')
        ? 'La solicitud tardó demasiado tiempo. Por favor, intenta con una pregunta más corta.'
        : 'Error processing chat request'
    }, { status: 500 });
  }
}
