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
    
    // Log de configuración (solo en desarrollo)
    if (process.env.NODE_ENV !== 'production') {
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
    return `FROM ${baseModel}

SYSTEM """
${systemPrompt}
"""
`;
  }

  /**
   * Crea un modelo personalizado en Ollama (a través de Open WebUI proxy o directamente)
   */
  async createCustomModel(
    modelName: string,
    baseModel: string,
    systemPrompt: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Construir el Modelfile
      const modelfileContent = this.buildModelfileContent(baseModel, systemPrompt);

      // Usar la API directa de Ollama si estamos en el mismo servidor
      // o el proxy de Ollama a través de Open WebUI
      const ollamaApiUrl = this.useDirectOllama
        ? `${this.baseUrl}/api/create`
        : this.isOpenWebUI
        ? `${this.baseUrl}/ollama/api/create`
        : `${this.baseUrl}/api/create`;

      if (process.env.NODE_ENV !== 'production') {
        console.log('📦 Creating custom model:', modelName);
        console.log('  Base model:', baseModel);
        console.log('  API endpoint:', ollamaApiUrl);
        console.log('  Modelfile content:', modelfileContent);
        console.log('  System prompt length:', systemPrompt.length);
      }

      // Crear el modelo usando la API de Ollama
      // La API requiere 'from' (modelo base) además del 'modelfile'
      const response = await fetch(ollamaApiUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          name: modelName,
          from: baseModel, // Modelo base requerido por la API
          modelfile: modelfileContent,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        // Si el modelo ya existe, intentar actualizarlo eliminándolo primero
        if (response.status === 409 || errorText.includes('already exists')) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('⚠️ Model already exists, attempting to update...');
          }
          
          // Intentar eliminar el modelo existente
          await this.deleteCustomModel(modelName);
          
          // Reintentar crear el modelo
          const retryResponse = await fetch(ollamaApiUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
              name: modelName,
              from: baseModel, // Modelo base requerido por la API
              modelfile: modelfileContent,
            }),
          });

          if (!retryResponse.ok) {
            const retryErrorText = await retryResponse.text();
            console.error('❌ Error creating model after retry:', retryErrorText);
            return { success: false, error: retryErrorText };
          }
        } else {
          console.error('❌ Error creating model:', errorText);
          return { success: false, error: errorText };
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Custom model created successfully:', modelName);
      }

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error creating custom model:', error);
      return { success: false, error: error.message || 'Unknown error' };
    }
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

      if (process.env.NODE_ENV !== 'production') {
        console.log('🗑️ Custom model deleted:', modelName);
      }

      return { success: true };
    } catch (error: any) {
      // No es un error si el modelo no existe
      if (process.env.NODE_ENV !== 'production') {
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
      
      // Si es modelo personalizado y estamos usando API directa, confiar en el Modelfile
      // Si usamos proxy de Open WebUI, siempre enviar system prompt por seguridad
      if (isCustomModel && this.useDirectOllama && skipSystemPrompt) {
        // Modelo personalizado en API directa: confiar en Modelfile, no enviar system prompt
        messages = messages.filter((msg: OllamaMessage) => msg.role !== 'system');
      }
      // Si no, mantener todos los mensajes (incluyendo system)
      
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
        },
      };

      const endpoint = this.useDirectOllama
        ? `${this.baseUrl}/api/chat`
        : `${this.baseUrl}/ollama/api/chat`;
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(isCustomModel && this.useDirectOllama && skipSystemPrompt
          ? '🦙 Using Direct Ollama API (Custom Model with Modelfile):'
          : '🦙 Using Ollama API (Custom Model):', endpoint);
        console.log('📤 Payload:', {
          model: ollamaPayload.model,
          messagesCount: ollamaPayload.messages.length,
          temperature: temperature,
          num_predict: numPredict,
          customModel: isCustomModel ? '✅ YES' : '❌ NO',
          usingModelfile: isCustomModel && this.useDirectOllama && skipSystemPrompt ? '✅ YES (Modelfile only)' : '❌ NO (with explicit system)',
          hasSystemPrompt: messages.some((m: OllamaMessage) => m.role === 'system'),
        });
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(ollamaPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Ollama API Error:', response.status, errorText);
        throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      if (process.env.NODE_ENV !== 'production') {
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
      
      if (process.env.NODE_ENV !== 'production') {
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
      
      if (process.env.NODE_ENV !== 'production') {
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
      
      if (process.env.NODE_ENV !== 'production') {
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
      
      if (process.env.NODE_ENV !== 'production') {
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
