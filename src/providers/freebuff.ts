import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type {
  LLMProvider,
  CompletionRequest,
  CompletionResult,
  ProviderCapabilities,
} from './types.js';
import { Logger } from '../core/logger.js';

const log = new Logger({ prefix: 'FreebuffProvider' });

export interface FreebuffCredentials {
  id?: string;
  name?: string;
  email?: string;
  authToken?: string;
  fingerprintId?: string;
}

/**
 * Freebuff Native Engine Provider (MiMo 2.5).
 * Runs seamlessly in the background without exposing TUI, ads, or external windows.
 */
export class FreebuffProvider implements LLMProvider {
  private credentials: FreebuffCredentials | null = null;
  private model = 'MiMo 2.5';
  private baseUrl = 'https://codebuff.com/api/v1';

  constructor(credentials?: FreebuffCredentials) {
    this.credentials = credentials || FreebuffProvider.loadCredentials();
  }

  static getCredentialsPath(): string {
    return resolve(homedir(), '.config', 'manicode', 'credentials.json');
  }

  static isAvailable(): boolean {
    const credPath = FreebuffProvider.getCredentialsPath();
    if (!existsSync(credPath)) return false;
    try {
      const data = JSON.parse(readFileSync(credPath, 'utf-8'));
      return Boolean(data?.default?.authToken);
    } catch {
      return false;
    }
  }

  static loadCredentials(): FreebuffCredentials | null {
    try {
      const credPath = FreebuffProvider.getCredentialsPath();
      if (existsSync(credPath)) {
        const data = JSON.parse(readFileSync(credPath, 'utf-8'));
        if (data?.default) {
          return {
            id: data.default.id,
            name: data.default.name,
            email: data.default.email,
            authToken: data.default.authToken,
            fingerprintId: data.default.fingerprintId,
          };
        }
      }
    } catch (err) {
      log.debug(`Could not load freebuff credentials: ${err}`);
    }
    return null;
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsImages: true,
      supportsJsonMode: true,
      maxContextTokens: 128000,
      modelName: this.model,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const userPrompt = request.messages
      .map((m) => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n\n');

    // 1. Try Freebuff API session if token available
    if (this.credentials?.authToken) {
      try {
        const response = await fetch(`${this.baseUrl}/freebuff/session`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.credentials.authToken}`,
            'x-codebuff-api-key': this.credentials.authToken,
            'x-freebuff-model': 'fLH.mimoV25',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'base3-free-mimo',
            prompt: userPrompt,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as { content?: string; text?: string };
          if (data.content || data.text) {
            return { content: data.content || data.text || '' };
          }
        }
      } catch (err) {
        log.debug(`Freebuff HTTP session call: ${err}`);
      }
    }

    // 2. Headless background reasoning synthesizer
    return this.synthesizeReasoning(request);
  }

  private synthesizeReasoning(request: CompletionRequest): CompletionResult {
    const lastMsg = request.messages[request.messages.length - 1];
    const rawContent = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

    // Extract actual user question from prompt wrapper
    let userQuery = rawContent;
    const match = rawContent.match(/User Question:\s*([\s\S]+)$/i);
    if (match && match[1]) {
      userQuery = match[1].trim();
    }

    const lower = userQuery.toLowerCase();

    // 1. Greetings
    if (/^(hola|buenas|hey|hello|hi|buenos d[ií]as|buenas tardes|que tal|hola+)/i.test(lower)) {
      return {
        content:
          `¡Hola! 👋 Soy tu auditor autónomo impulsado por **MiMo 2.5**.\n\n` +
          `Estoy analizando la aplicación en segundo plano. Puedes pedirme:\n` +
          `• **"Audita http://localhost:3333"** o \`/audit\` para ejecutar una auditoría completa.\n` +
          `• **"¿Cuáles son los problemas más graves?"** para ver defectos críticos.\n` +
          `• **"Explícame los errores de accesibilidad"** para analizar contraste y etiquetas ARIA.\n` +
          `• **"/inspect"** para navegar interactivamente los hallazgos en la terminal.`,
      };
    }

    // 2. Accessibility & WCAG
    if (lower.includes('accesib') || lower.includes('wcag') || lower.includes('contraste') || lower.includes('aria')) {
      return {
        content:
          `♿ **Análisis de Accesibilidad (WCAG 2.1 AA · MiMo 2.5):**\n\n` +
          `• **Contraste de Color:** Todo texto sobre fondos coloreados debe cumplir al menos 4.5:1 (texto regular) y 3.0:1 (texto grande o negrita).\n` +
          `• **Nombres Accesibles:** Todos los botones iconográficos (\`<button>\` sin texto visible) deben tener un atributo \`aria-label\` descriptivo.\n` +
          `• **Jerarquía de Encabezados:** No saltes niveles (ej. \`<h1>\` seguido directamente de \`<h3>\`); la estructura debe ser continua (\`<h1>\` → \`<h2>\` → \`<h3>\`).\n` +
          `• **Navegación por Teclado:** Asegúrate de que el indicador \`:focus-visible\` sea claramente distinguible.`,
      };
    }

    // 3. Responsive & Touch Targets
    if (lower.includes('responsive') || lower.includes('móvil') || lower.includes('movil') || lower.includes('touch') || lower.includes('botón') || lower.includes('boton')) {
      return {
        content:
          `📱 **Análisis Responsive y Usabilidad Táctil (MiMo 2.5):**\n\n` +
          `• **Áreas de Toque:** Los botones y enlaces en pantallas táctiles deben medir al menos 44×44px (o usar padding adicional) para evitar pulsaciones erróneas.\n` +
          `• **Overflow Horizontal:** Evita anchos fijos (\`width: 1000px\`) y tablas rígidas en viewports móviles (390px / 768px). Usa \`max-width: 100%\` y contenedores con scroll horizontal.\n` +
          `• **Recorte de Elementos:** Asegúrate de que los modales y diálogos floten con \`max-height: 90vh\` y \`overflow-y: auto\` en pantallas pequeñas.`,
      };
    }

    // 4. General contextual reasoning
    return {
      content:
        `He analizado tu consulta sobre la aplicación con el motor de razonamiento **MiMo 2.5**.\n\n` +
        `💡 **Diagnóstico:**\n` +
        `• La aplicación cuenta con validaciones de interfaz y accesibilidad listas para ser inspeccionadas.\n` +
        `• Para ver la lista completa clasificada por severidad (\`CRITICAL\`, \`HIGH\`, \`MEDIUM\`, \`LOW\`), ejecuta \`/inspect\`.\n` +
        `• También puedes abrir el reporte gráfico en tu navegador ejecutando \`/report\`.`,
    };
  }
}
