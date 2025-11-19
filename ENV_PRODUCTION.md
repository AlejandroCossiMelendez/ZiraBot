# Configuración para Producción (Mismo Servidor)

Cuando tu aplicación Next.js se aloja en el **mismo servidor** donde está Ollama, configura las variables de entorno así:

## Configuración Recomendada

En tu archivo `.env` o `.env.production`:

```env
# API Directa de Ollama (mismo servidor)
OLLAMA_DIRECT_URL=http://localhost:11434

# NO configurar estas variables si usas API directa:
# OPEN_WEBUI_URL=
# OPEN_WEBUI_API_KEY=
```

## Ventajas de Usar API Directa

✅ **Modelfile funciona correctamente**: Los modelos personalizados respetan el SYSTEM prompt del Modelfile sin necesidad de enviarlo en cada petición

✅ **Mejor rendimiento**: Sin overhead de proxy ni autenticación

✅ **Menos tokens**: El system prompt ya está incorporado en el modelo, solo se envía el historial de conversación

✅ **Más confiable**: Conexión directa sin intermediarios

## Cómo Funciona

1. **Detección automática**: Si `OLLAMA_DIRECT_URL` está configurado o detecta `localhost:11434`, usa API directa
2. **Modelos personalizados**: Cuando creas un bot con `system_prompt`, se crea un modelo personalizado usando Modelfile
3. **Uso del Modelfile**: Si usas modelo personalizado en API directa, **solo se envía el historial** (sin system prompt), confiando en el Modelfile
4. **Modelos normales**: Si usas un modelo base, siempre se envía el system prompt en cada petición

## Logs Esperados

Cuando uses API directa con modelo personalizado, verás:

```
🔧 OllamaClient Configuration:
  Base URL: http://localhost:11434
  Using Direct Ollama: ✅ YES (Same Server)
  Using Open WebUI: ❌ NO

💬 Chat Request:
  Custom Model: ✅ YES (Modelfile only)
  Using Direct Ollama: ✅ YES (Same Server)
  API: 🦙 Direct Ollama
  Using Modelfile only: ✅ YES

🦙 Using Direct Ollama API (Custom Model with Modelfile): http://localhost:11434/api/chat
📤 Payload:
  customModel: ✅ YES
  usingModelfile: ✅ YES (Modelfile only)
  hasSystemPrompt: false
```

## Si Necesitas Usar Open WebUI

Si por alguna razón necesitas usar Open WebUI (otro servidor), configura:

```env
# Open WebUI en otro servidor
OPEN_WEBUI_URL=http://72.61.11.3:8080
OPEN_WEBUI_API_KEY=tu_api_key_aqui

# NO configurar OLLAMA_DIRECT_URL en este caso
```

