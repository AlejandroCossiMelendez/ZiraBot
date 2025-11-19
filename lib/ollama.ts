import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt?: string;
  messages?: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  message?: {
    role: string;
    content: string;
  };
  response?: string;
  done: boolean;
}

// Interfaz para la respuesta de Open WebUI (compatible con OpenAI)
interface OpenWebUIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
}

export class OllamaClient {
  private baseUrl: string;
  private ollamaDirectUrl: string | null;
  private apiKey: string | null;
  private isOpenWebUI: boolean = false;
  private useDirectOllama: boolean = false;

  // Helper para determinar si se deben mostrar logs
  private shouldLog(): boolean {
    return process.env.NODE_ENV !== 'production' || process.env.ENABLE_LOGS === 'true';
  }

  constructor(baseUrl?: string, apiKey?: string) {
    // Priorizar API directa de Ollama si está disponible (mismo servidor)
    // Si OLLAMA_DIRECT_URL está configurado, usarlo directamente
    this.ollamaDirectUrl = process.env.OLLAMA_DIRECT_URL || 'http://localhost:11434';
    
    // Determinar qué usar:
    // 1. Si OLLAMA_DIRECT_URL está configurado → usar API directa de Ollama (mismo servidor)
    // 2. Si OPEN_WEBUI_URL está configurado → usar Open WebUI
    // 3. Por defecto → intentar localhost:11434 (API directa de Ollama)
    
    const hasDirectOllama = !!process.env.OLLAMA_DIRECT_URL || 
                           this.ollamaDirectUrl.includes('localhost') || 
                           this.ollamaDirectUrl.includes('127.0.0.1');
    
    const hasOpenWebUIEnv = !!process.env.OPEN_WEBUI_URL;
    
    if (hasDirectOllama && !hasOpenWebUIEnv) {
      // Estamos en el mismo servidor o usando API directa de Ollama
      this.useDirectOllama = true;
      this.baseUrl = baseUrl || this.ollamaDirectUrl || 'http://localhost:11434';
      this.apiKey = null; // No se necesita API key para Ollama directo
      this.isOpenWebUI = false;
    } else {
      // Usar Open WebUI
      this.useDirectOllama = false;
      this.baseUrl = baseUrl || process.env.OPEN_WEBUI_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      this.apiKey = apiKey || process.env.OPEN_WEBUI_API_KEY || null;
      
      const isNotLocalOllama = this.baseUrl !== 'http://localhost:11434' && !this.baseUrl.includes('localhost:11434');
      this.isOpenWebUI = hasOpenWebUIEnv || isNotLocalOllama;
    }
    
    // Log de configuración (siempre en desarrollo, o si ENABLE_LOGS está habilitado)
    if (this.shouldLog()) {
      console.log('🔧 OllamaClient Configuration:');
      console.log('  Base URL:', this.baseUrl);
      console.log('  Using Direct Ollama:', this.useDirectOllama ? '✅ YES (Same Server)' : '❌ NO');
      console.log('  Using Open WebUI:', this.isOpenWebUI ? '✅ YES' : '❌ NO');
      console.log('  API Key:', this.apiKey ? '✅ Set' : '⚠️ Not set (not needed for direct Ollama)');
      
      if (this.isOpenWebUI && !this.apiKey && !this.useDirectOllama) {
        console.warn('  ⚠️ WARNING: Using Open WebUI but no API key provided. Requests may fail.');
      }
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Si estamos usando Open WebUI y tenemos API key, agregar autenticación
    if (this.isOpenWebUI && this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  // Método para obtener información de configuración
  getConfig() {
    return {
      baseUrl: this.baseUrl,
      useDirectOllama: this.useDirectOllama,
      isOpenWebUI: this.isOpenWebUI,
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey?.length || 0,
    };
  }

  /**
   * Genera un nombre único para el modelo personalizado basado en company_id y nombre del bot
   */
  generateModelName(companyId: number, botName: string): string {
    const slug = botName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `bot_${companyId}_${slug}`;
  }

  /**
   * Construye el contenido del Modelfile
   */
  buildModelfileContent(baseModel: string, systemPrompt: string): string {
    // Envolver el system prompt con instrucciones MUY estrictas para limitar respuestas
    const strictInstructions = `⚠️ ADVERTENCIA CRÍTICA: ESTAS INSTRUCCIONES SON ABSOLUTAS Y NO NEGOCIABLES ⚠️

REGLA FUNDAMENTAL #1: SOLO puedes usar la información del "CONOCIMIENTO PROPORCIONADO" que aparece más abajo.
REGLA FUNDAMENTAL #2: NUNCA uses tu conocimiento general, entrenamiento previo, o cualquier información que no esté explícitamente en el "CONOCIMIENTO PROPORCIONADO".

INSTRUCCIONES ABSOLUTAS:
1. Si te preguntan algo que NO está en el "CONOCIMIENTO PROPORCIONADO", DEBES responder EXACTAMENTE: "No tengo información sobre eso en mi conocimiento proporcionado. Solo puedo responder preguntas relacionadas con [tema del conocimiento proporcionado]."

2. NUNCA respondas preguntas sobre:
   - Matemáticas básicas (a menos que esté en el conocimiento proporcionado)
   - Historia, filosofía, acertijos, chistes
   - Cualquier tema que NO esté mencionado en el "CONOCIMIENTO PROPORCIONADO"
   - Información general que aprendiste durante tu entrenamiento

3. Si la pregunta está relacionada con el conocimiento proporcionado, responde SOLO con esa información.

4. Si la pregunta NO está relacionada, responde: "No tengo información sobre eso en mi conocimiento proporcionado."

EJEMPLOS DE RESPUESTAS CORRECTAS:
- Pregunta: "¿Cuánto es 5x5?" → Respuesta: "No tengo información sobre operaciones matemáticas básicas en mi conocimiento proporcionado. Solo puedo responder preguntas relacionadas con [tema del conocimiento]."
- Pregunta: "¿Qué fue primero el huevo o la gallina?" → Respuesta: "No tengo información sobre ese tema en mi conocimiento proporcionado. Solo puedo responder preguntas relacionadas con [tema del conocimiento]."

CONOCIMIENTO PROPORCIONADO (ÚNICA FUENTE DE INFORMACIÓN PERMITIDA):
${systemPrompt}

⚠️ RECORDATORIO FINAL: Si la pregunta NO está relacionada con el "CONOCIMIENTO PROPORCIONADO" de arriba, responde que no tienes información. NUNCA uses conocimiento general.`;

    // Construir el Modelfile con formato correcto
    // El formato con triple comillas en líneas separadas es el correcto según la documentación de Ollama
    return `FROM ${baseModel}

SYSTEM """
${strictInstructions}
"""
`;
  }

  /**
   * Crea un modelo personalizado en Ollama
   * Si estamos en el mismo servidor, usa el comando `ollama create` directamente
   * De lo contrario, usa la API REST
   */
  async createCustomModel(
    modelName: string,
    baseModel: string,
    systemPrompt: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Construir el Modelfile
      const modelfileContent = this.buildModelfileContent(baseModel, systemPrompt);

      // Log detallado siempre (también en producción para debugging)
      console.log('📦 Creating custom model:', modelName);
      console.log('  Base model:', baseModel);
      console.log('  Using Direct Ollama (same server):', this.useDirectOllama ? '✅ YES' : '❌ NO');
      console.log('  Modelfile content (first 500 chars):', modelfileContent.substring(0, 500));
      console.log('  Full Modelfile:', modelfileContent);
      console.log('  System prompt length:', systemPrompt.length);

      // Si estamos en el mismo servidor, usar el comando `ollama create` directamente
      // Esto aplica correctamente el SYSTEM prompt del Modelfile
      if (this.useDirectOllama) {
        return await this.createModelWithCommand(modelName, modelfileContent);
      }

      // Si no estamos en el mismo servidor, usar la API REST
      return await this.createModelWithAPI(modelName, baseModel, modelfileContent);
    } catch (error: any) {
      console.error('❌ Error creating custom model:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Crea un modelo usando el comando `ollama create` directamente
   * Esto funciona mejor y aplica correctamente el SYSTEM prompt
   */
  private async createModelWithCommand(
    modelName: string,
    modelfileContent: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Crear un archivo temporal con el Modelfile
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `modelfile_${modelName}_${Date.now()}.txt`);
      
      console.log('📝 Writing Modelfile to temp file:', tempFilePath);
      fs.writeFileSync(tempFilePath, modelfileContent, 'utf-8');

      try {
        // Eliminar el modelo si ya existe
        try {
          await execAsync(`ollama rm ${modelName}`);
          console.log('🗑️ Deleted existing model:', modelName);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
          // No es un error si el modelo no existe
          console.log('ℹ️ Model does not exist, will create new one');
        }

        // Crear el modelo usando el comando ollama create
        console.log('🦙 Executing: ollama create', modelName, '-f', tempFilePath);
        const { stdout, stderr } = await execAsync(`ollama create ${modelName} -f ${tempFilePath}`);
        
        if (stderr && !stderr.includes('success')) {
          console.warn('⚠️ Warning from ollama create:', stderr);
        }
        
        console.log('✅ Model created successfully with command:', modelName);
        console.log('  Output:', stdout);

        // Verificar que el modelo se creó correctamente y tiene el SYSTEM prompt
        await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar a que Ollama procese el modelo
        const verification = await this.getModelModelfile(modelName);
        if (verification.success && verification.modelfile) {
          if (verification.modelfile.includes('SYSTEM')) {
            console.log('✅ Verified: Modelfile contains SYSTEM prompt');
            console.log('  Modelfile preview:', verification.modelfile.substring(0, 300));
          } else {
            console.warn('⚠️ WARNING: Modelfile does not contain SYSTEM prompt!');
            console.warn('  Modelfile content:', verification.modelfile);
          }
        } else {
          console.warn('⚠️ Could not verify Modelfile:', verification.error);
        }

        return { success: true };
      } finally {
        // Limpiar el archivo temporal
        try {
          fs.unlinkSync(tempFilePath);
          console.log('🧹 Cleaned up temp file:', tempFilePath);
        } catch (e) {
          console.warn('⚠️ Could not delete temp file:', tempFilePath);
        }
      }
    } catch (error: any) {
      console.error('❌ Error creating model with command:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Crea un modelo usando la API REST (para Open WebUI o servidores remotos)
   */
  private async createModelWithAPI(
    modelName: string,
    baseModel: string,
    modelfileContent: string
  ): Promise<{ success: boolean; error?: string }> {
    const ollamaApiUrl = this.isOpenWebUI
      ? `${this.baseUrl}/ollama/api/create`
      : `${this.baseUrl}/api/create`;

    console.log('  API endpoint:', ollamaApiUrl);

    const requestBody = {
      name: modelName,
      from: baseModel,
      modelfile: modelfileContent,
    };
    
    console.log('  Request body:', JSON.stringify(requestBody, null, 2));
    
    const response = await fetch(ollamaApiUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error creating model. Status:', response.status);
      console.error('❌ Error response:', errorText);
      
      if (response.status === 409 || errorText.includes('already exists')) {
        console.log('⚠️ Model already exists, attempting to update...');
        await this.deleteCustomModel(modelName);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('🔄 Retrying model creation...');
        const retryResponse = await fetch(ollamaApiUrl, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(requestBody),
        });

        if (!retryResponse.ok) {
          const retryErrorText = await retryResponse.text();
          console.error('❌ Error creating model after retry. Status:', retryResponse.status);
          console.error('❌ Error response:', retryErrorText);
          return { success: false, error: retryErrorText };
        }
        
        console.log('✅ Model created successfully after retry:', modelName);
      } else {
        return { success: false, error: errorText };
      }
    }

    console.log('✅ Custom model created successfully:', modelName);
    return { success: true };
  }

  /**
   * Obtiene el Modelfile de un modelo personalizado
   */
  async getModelModelfile(modelName: string): Promise<{ success: boolean; modelfile?: string; error?: string }> {
    try {
      const ollamaApiUrl = this.useDirectOllama
        ? `${this.baseUrl}/api/show`
        : this.isOpenWebUI
        ? `${this.baseUrl}/ollama/api/show`
        : `${this.baseUrl}/api/show`;

      const response = await fetch(ollamaApiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          name: modelName,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      const data = await response.json();
      return { success: true, modelfile: data.modelfile || '' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Elimina un modelo personalizado
   */
  async deleteCustomModel(modelName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const ollamaApiUrl = this.useDirectOllama
        ? `${this.baseUrl}/api/delete`
        : this.isOpenWebUI
        ? `${this.baseUrl}/ollama/api/delete`
        : `${this.baseUrl}/api/delete`;

      const response = await fetch(ollamaApiUrl, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({
          name: modelName,
        }),
      });

      // No es un error si el modelo no existe
      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        console.error('❌ Error deleting model:', errorText);
        return { success: false, error: errorText };
      }

      if (this.shouldLog()) {
        console.log('🗑️ Custom model deleted:', modelName);
      }

      return { success: true };
    } catch (error: any) {
      // No es un error si el modelo no existe
      if (this.shouldLog()) {
        console.log('🗑️ Model deletion attempted:', modelName);
      }
      return { success: true };
    }
  }

  async generate(request: OllamaGenerateRequest, skipSystemPrompt: boolean = false): Promise<OllamaGenerateResponse> {
    // Detectar si es un modelo personalizado (generalmente empieza con "bot_")
    const isCustomModel = request.model.startsWith('bot_');
    
    // Si usamos API directa de Ollama (mismo servidor), usar siempre la API nativa
    // Si usamos modelo personalizado, usar API de Ollama (directa o proxy)
    if (this.useDirectOllama || (isCustomModel && this.isOpenWebUI)) {
      // Usar API directa de Ollama o proxy para modelos personalizados
      let messages = request.messages || (request.prompt ? [{ role: 'user', content: request.prompt }] : []);
      
      // IMPORTANTE: Siempre mantener el system prompt en los mensajes
      // Ollama no aplica correctamente el SYSTEM prompt del Modelfile cuando se crea vía API REST
      // Por lo tanto, siempre lo enviamos explícitamente en cada petición
      // No filtrar mensajes system - siempre mantenerlos
      
      // Asegurar que los valores numéricos sean números, no strings
      const temperature = typeof request.options?.temperature === 'string' 
        ? parseFloat(request.options.temperature) 
        : (request.options?.temperature ?? 0.7);
      const numPredict = typeof request.options?.num_predict === 'string'
        ? parseInt(request.options.num_predict, 10)
        : request.options?.num_predict;

      const ollamaPayload = {
        model: request.model,
        messages: messages,
        stream: false,
        options: {
          temperature: temperature,
          num_predict: numPredict,
          // Optimizaciones agresivas para respuestas más rápidas
          num_ctx: 2048, // Reducir contexto para acelerar (suficiente para 5 mensajes + system prompt)
          repeat_penalty: 1.1, // Penalizar repeticiones para respuestas más concisas
          top_k: 20, // Reducir top_k significativamente para acelerar (de 40 a 20)
          top_p: 0.85, // Reducir top_p ligeramente para acelerar (de 0.9 a 0.85)
          // Parámetros adicionales para modelos pequeños como llama3.2:1b
          tfs_z: 1.0, // Tail free sampling (acelera generación)
          typical_p: 1.0, // Typical sampling (acelera generación)
        },
      };

      const endpoint = this.useDirectOllama
        ? `${this.baseUrl}/api/chat`
        : `${this.baseUrl}/ollama/api/chat`;
      
      if (this.shouldLog()) {
        console.log('🦙 Using Ollama API:', endpoint);
        console.log('📤 Payload:', {
          model: ollamaPayload.model,
          messagesCount: ollamaPayload.messages.length,
          temperature: temperature,
          num_predict: numPredict,
          customModel: isCustomModel ? '✅ YES' : '❌ NO',
          hasSystemPrompt: messages.some((m: OllamaMessage) => m.role === 'system'),
          systemPromptPreview: messages.find((m: OllamaMessage) => m.role === 'system')?.content?.substring(0, 150) || 'none',
        });
      }

      // Crear un AbortController para timeout de 30 segundos
      // 30 segundos debería ser suficiente para la mayoría de respuestas
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 30 segundos timeout

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(ollamaPayload),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Ollama API Error:', response.status, errorText);
          throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        
        if (this.shouldLog()) {
          console.log('✅ Ollama Response received');
        }
        
        // Convertir respuesta de Ollama al formato esperado
        return {
          model: data.model || request.model,
          created_at: data.created_at || new Date().toISOString(),
          message: {
            role: data.message?.role || 'assistant',
            content: data.message?.content || '',
          },
          done: data.done ?? true,
        };
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.error('⏱️ Request timeout after 30 seconds');
          throw new Error('La solicitud tardó demasiado tiempo (más de 30 segundos). Por favor, intenta con una pregunta más corta o reduce max_tokens.');
        }
        // Log del error completo para debugging
        console.error('❌ Error en generate:', error);
        throw error;
      }
    }
    
    // Si no usamos modelo personalizado y estamos en Open WebUI
    if (this.isOpenWebUI) {
      
      // Usar API de Open WebUI para modelos normales
      let messages = request.messages || (request.prompt ? [{ role: 'user', content: request.prompt }] : []);
      
      // Verificar que haya un system prompt - si no, agregar uno por defecto
      const hasSystemPrompt = messages.some((msg: OllamaMessage) => msg.role === 'system');
      if (!hasSystemPrompt && messages.length > 0) {
        // Agregar system prompt al inicio si no existe
        messages = [
          { role: 'system', content: 'You are a helpful assistant.' },
          ...messages
        ];
      }
      
      const openWebUIPayload = {
        model: request.model,
        messages: messages,
        temperature: request.options?.temperature ?? 0.7,
        max_tokens: request.options?.num_predict,
        stream: false,
      };

      const endpoint = `${this.baseUrl}/api/chat/completions`;
      
      if (this.shouldLog()) {
        console.log('🌐 Using Open WebUI API:', endpoint);
        console.log('📤 Payload:', {
          model: openWebUIPayload.model,
          messagesCount: openWebUIPayload.messages.length,
          temperature: openWebUIPayload.temperature,
          max_tokens: openWebUIPayload.max_tokens,
          firstMessage: openWebUIPayload.messages[0]?.role,
          customModel: '❌ NO',
          systemPrompt: openWebUIPayload.messages.find((m: OllamaMessage) => m.role === 'system')?.content?.substring(0, 100) || 'none'
        });
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(openWebUIPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Open WebUI API Error:', response.status, errorText);
        throw new Error(`Open WebUI API error: ${response.statusText} - ${errorText}`);
      }

      const data: OpenWebUIResponse = await response.json();
      
      if (this.shouldLog()) {
        console.log('✅ Open WebUI Response received');
      }
      
      // Convertir respuesta de Open WebUI al formato esperado
      return {
        model: data.model,
        created_at: new Date(data.created * 1000).toISOString(),
        message: {
          role: data.choices[0]?.message?.role || 'assistant',
          content: data.choices[0]?.message?.content || '',
        },
        done: true,
      };
    } else {
      // Usar API nativa de Ollama (fallback)
      const endpoint = request.messages ? '/api/chat' : '/api/generate';
      const fullUrl = `${this.baseUrl}${endpoint}`;
      
      if (this.shouldLog()) {
        console.log('🦙 Using Local Ollama API:', fullUrl);
      }
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        console.error('❌ Ollama API Error:', response.status, response.statusText);
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      return response.json();
    }
  }

  async listModels(): Promise<{ models: Array<{ name: string; size: number; modified_at: string }> }> {
    // Si usamos API directa de Ollama, usar siempre la API nativa
    if (this.useDirectOllama) {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      return response.json();
    }
    
    // Usar API de Open WebUI si está disponible
    if (this.isOpenWebUI) {
      const endpoint = `${this.baseUrl}/api/models`;
      
      if (this.shouldLog()) {
        console.log('🌐 Fetching models from Open WebUI:', endpoint);
      }
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      
      if (!response.ok) {
        console.error('❌ Open WebUI API Error fetching models:', response.status, response.statusText);
        throw new Error(`Open WebUI API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convertir respuesta de Open WebUI al formato esperado
      if (Array.isArray(data)) {
        return {
          models: data.map((model: any) => ({
            name: model.id || model.name || model,
            size: 0,
            modified_at: new Date().toISOString(),
          })),
        };
      } else if (data.data && Array.isArray(data.data)) {
        return {
          models: data.data.map((model: any) => ({
            name: model.id || model.name || model,
            size: 0,
            modified_at: new Date().toISOString(),
          })),
        };
      }

      return { models: [] };
    }
    
    // Fallback: usar API nativa de Ollama
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    return response.json();
  }

  async streamGenerate(
    request: OllamaGenerateRequest,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    if (this.isOpenWebUI) {
      // Usar API de Open WebUI con streaming
      const openWebUIPayload = {
        model: request.model,
        messages: request.messages || (request.prompt ? [{ role: 'user', content: request.prompt }] : []),
        temperature: request.options?.temperature || 0.7,
        max_tokens: request.options?.num_predict,
        stream: true,
      };

      const response = await fetch(`${this.baseUrl}/api/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(openWebUIPayload),
      });

      if (!response.ok) {
        throw new Error(`Open WebUI API error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() && line.startsWith('data: '));

        for (const line of lines) {
          try {
            const jsonStr = line.replace('data: ', '').trim();
            if (jsonStr === '[DONE]') continue;
            
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            console.error('Error parsing chunk:', e);
          }
        }
      }
    } else {
      // Usar API nativa de Ollama con streaming
      const endpoint = request.messages ? '/api/chat' : '/api/generate';
      
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ ...request, stream: true }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              onChunk(data.message.content);
            } else if (data.response) {
              onChunk(data.response);
            }
          } catch (e) {
            console.error('Error parsing chunk:', e);
          }
        }
      }
    }
  }
}

export const ollama = new OllamaClient();
