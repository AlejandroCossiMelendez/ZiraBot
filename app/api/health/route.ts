import { NextResponse } from 'next/server';
import { ollama } from '@/lib/ollama';

export async function GET() {
  try {
    // Obtener configuración actual del cliente Ollama
    const config = ollama.getConfig();

    // Intentar listar modelos para verificar conexión
    let connectionStatus = 'unknown';
    let modelsCount = 0;
    let error: string | null = null;

    try {
      const modelsResponse = await ollama.listModels();
      modelsCount = modelsResponse.models?.length || 0;
      connectionStatus = 'connected';
    } catch (e: any) {
      connectionStatus = 'error';
      error = e.message || 'Unknown error';
    }

    return NextResponse.json({
      status: 'ok',
      config: {
        baseUrl: config.baseUrl,
        isOpenWebUI: config.isOpenWebUI,
        hasApiKey: config.hasApiKey,
        apiKeyLength: config.apiKeyLength,
        apiKey: config.hasApiKey ? `${config.apiKeyLength} characters` : 'not set',
      },
      connection: {
        status: connectionStatus,
        modelsAvailable: modelsCount,
        error: error,
      },
      message: config.isOpenWebUI 
        ? '✅ Using Open WebUI API (Cloud)' 
        : '⚠️ Using Local Ollama API',
      environment: {
        OPEN_WEBUI_URL: process.env.OPEN_WEBUI_URL || 'not set',
        OPEN_WEBUI_API_KEY: process.env.OPEN_WEBUI_API_KEY ? `${process.env.OPEN_WEBUI_API_KEY.length} characters` : 'not set',
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'not set',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        status: 'error', 
        error: error.message 
      },
      { status: 500 }
    );
  }
}

