import chalk from 'chalk';
import readline from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exec, spawnSync } from 'node:child_process';
import type { Finding } from '../../core/findings/types.js';
import { Orchestrator } from '../../agents/orchestrator.js';
import { loadConfig } from '../../core/config/loader.js';
import { CommandCodeProvider } from '../../providers/commandcode.js';
import { InteractiveInspector } from './inspector.js';
import { runInteractiveLogin } from '../../core/browser/auth.js';
import { SessionManager, type ChatSession } from '../../core/session/manager.js';
import type { LLMProvider } from '../../providers/types.js';

export interface ChatREPLOptions {
  targetUrl?: string;
  sessionId?: string;
  continueLatest?: boolean;
}

export class AgentChatREPL {
  private targetUrl: string;
  private latestFindings: Finding[] = [];
  private htmlReportPath?: string;
  private storageStatePath?: string;
  private aiProvider?: LLMProvider | null;
  private processing = false;
  private currentSession: ChatSession;

  constructor(options?: ChatREPLOptions | string) {
    const opts: ChatREPLOptions = typeof options === 'string' ? { targetUrl: options } : options || {};
    this.targetUrl = opts.targetUrl || 'http://localhost:3000';
    this.aiProvider = CommandCodeProvider.fromEnv();

    if (existsSync('./auth/storageState.json')) {
      this.storageStatePath = resolve('./auth/storageState.json');
    }
    this.loadPreviousAuditIfAvailable();

    // Session initialization
    if (opts.sessionId) {
      const loaded = SessionManager.loadSession(opts.sessionId);
      this.currentSession = loaded || SessionManager.createSession(this.targetUrl);
    } else if (opts.continueLatest) {
      const latest = SessionManager.getLatestSession();
      this.currentSession = latest || SessionManager.createSession(this.targetUrl);
    } else {
      // Start fresh session by default
      this.currentSession = SessionManager.createSession(this.targetUrl);
    }
  }

  private loadPreviousAuditIfAvailable(): void {
    const jsonPath = resolve(process.cwd(), './uiux-audit-results/report.json');
    if (existsSync(jsonPath)) {
      try {
        const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
        if (data.findings && Array.isArray(data.findings)) {
          this.latestFindings = data.findings;
          this.htmlReportPath = resolve(process.cwd(), './uiux-audit-results/report.html');
        }
      } catch {
        // Ignore parse error
      }
    }
  }

  async start(): Promise<void> {
    console.clear();
    this.printWelcome();

    // If resumed session with existing messages, show brief summary
    if (this.currentSession.messages.length > 0) {
      console.log(chalk.dim(`  ↻ Conversación reanudada: "${this.currentSession.title}" (${this.currentSession.messages.length} mensajes previos)`));
      const lastMsg = this.currentSession.messages[this.currentSession.messages.length - 1];
      if (lastMsg) {
        console.log(chalk.dim(`  Último mensaje (${lastMsg.role}): ${typeof lastMsg.content === 'string' ? lastMsg.content.slice(0, 80) : ''}...\n`));
      }
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan.bold('uiux-auditor ❯ '),
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input || this.processing) {
        rl.prompt();
        return;
      }

      if (['exit', 'quit', 'salir', '/exit', '/quit'].includes(input.toLowerCase())) {
        console.log(chalk.dim('\n  ¡Hasta luego! 👋\n'));
        rl.close();
        process.exit(0);
      }

      try {
        this.processing = true;
        await this.handleUserInput(input);
      } catch (err) {
        console.log(chalk.red(`\n  ✖ Error: ${err instanceof Error ? err.message : err}`));
      } finally {
        this.processing = false;
      }

      console.log('');
      rl.prompt();
    });

    rl.on('close', () => {
      process.exit(0);
    });
  }

  private printWelcome(): void {
    const aiLabel = this.aiProvider
      ? `  🧠 Motor IA: ${this.aiProvider.capabilities().modelName} (Conectado)`
      : '  🛠️  Modo: Motor de Auditoría Local (o /freebuff)';
    console.log(chalk.cyan('┌────────────────────────────────────────────────────────────────────────┐'));
    console.log(chalk.cyan('│') + chalk.bold.white('  🤖 UI/UX AUDITOR — Interactive Agent Chat REPL') + ' '.repeat(24) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.green(aiLabel) + ' '.repeat(Math.max(0, 68 - aiLabel.length)) + chalk.cyan('│'));
    console.log(chalk.cyan('├────────────────────────────────────────────────────────────────────────┤'));
    console.log(chalk.cyan('│') + chalk.dim('  Comandos de auditoría e inspección:                                   ') + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /audit [url]  ') + chalk.dim('→ Iniciar auditoría completa') + ' '.repeat(26) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /login [url]  ') + chalk.dim('→ Iniciar sesión asistida (OAuth, 2FA, JWT)') + ' '.repeat(11) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /inspect      ') + chalk.dim('→ Abrir inspector interactivo de hallazgos') + ' '.repeat(14) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /report       ') + chalk.dim('→ Abrir reporte HTML en navegador') + ' '.repeat(23) + chalk.cyan('│'));
    console.log(chalk.cyan('├────────────────────────────────────────────────────────────────────────┤'));
    console.log(chalk.cyan('│') + chalk.dim('  Gestión de conversaciones:                                            ') + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /sessions     ') + chalk.dim('→ Listar historial de conversaciones guardadas') + ' '.repeat(10) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /resume <id>  ') + chalk.dim('→ Retomar una conversación previa') + ' '.repeat(23) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /new          ') + chalk.dim('→ Iniciar una nueva conversación limpia') + ' '.repeat(17) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /exit         ') + chalk.dim('→ Salir del chat') + ' '.repeat(40) + chalk.cyan('│'));
    console.log(chalk.cyan('└────────────────────────────────────────────────────────────────────────┘'));

    if (this.storageStatePath) {
      console.log(chalk.green(`  🔑 Sesión autenticada activa (${this.storageStatePath})`));
    }
    if (this.latestFindings.length > 0) {
      console.log(chalk.green(`  ℹ️  Auditoría previa cargada en memoria: ${this.latestFindings.length} hallazgos disponibles.`));
    }
    console.log('');
  }

  private async handleUserInput(input: string): Promise<void> {
    const lower = input.toLowerCase().trim();

    // 1. Session management commands
    if (lower === '/sessions' || lower === '/history' || lower === 'sessions' || lower === 'history') {
      this.listSessions();
      return;
    }

    if (lower.startsWith('/resume') || lower.startsWith('/load')) {
      const parts = input.split(/\s+/);
      if (parts[1]) {
        this.resumeSession(parts[1]);
      } else {
        this.listSessions();
        console.log(chalk.yellow('  Usa: /resume <número o ID de sesión>'));
      }
      return;
    }

    if (lower === '/new' || lower === 'new' || lower === '/clear' || lower === 'clear') {
      this.startNewSession();
      return;
    }

    // 2. Audit & Tool commands
    if (lower.startsWith('/login') || lower.startsWith('login')) {
      const parts = input.split(/\s+/);
      const url = parts.find((p) => p.startsWith('http://') || p.startsWith('https://')) || this.targetUrl;
      await this.runLogin(url);
      return;
    }

    if (lower.startsWith('/audit') || lower.startsWith('audit')) {
      const parts = input.split(/\s+/);
      const url = parts.find((p) => p.startsWith('http://') || p.startsWith('https://')) || this.targetUrl;
      await this.runAudit(url);
      return;
    }

    if (lower.startsWith('/freebuff') || lower === 'freebuff') {
      this.launchFreebuff();
      return;
    }

    if (lower.startsWith('/inspect') || lower === 'inspect') {
      await this.openInspector();
      return;
    }

    if (lower.startsWith('/report') || lower === 'report') {
      this.openReport();
      return;
    }

    if (lower.startsWith('/skills') || lower === 'skills') {
      this.printSkills();
      return;
    }

    if (lower.startsWith('/status') || lower === 'status') {
      this.printStatus();
      return;
    }

    if (lower.startsWith('/help') || lower === 'help' || lower === 'ayuda') {
      this.printWelcome();
      return;
    }

    // 3. Conversational AI query
    if (!this.aiProvider) {
      this.aiProvider = CommandCodeProvider.fromEnv();
    }

    if (this.aiProvider) {
      await this.queryAI(input);
    } else {
      console.log(chalk.yellow('\n  ▲ No hay un proveedor de IA configurado.'));
      console.log('  Para habilitar el chat con IA:');
      console.log('  1. Configura tus variables de CommandCode / OpenAI / DeepSeek / Ollama:');
      console.log(chalk.dim('     export COMMANDCODE_API_KEY="tu-key"'));
      console.log(chalk.dim('     export COMMANDCODE_MODEL="minimax-m3-free"'));
      console.log('  2. O escribe /freebuff para abrir el agente Freebuff con modelos gratuitos.');
    }
  }

  private listSessions(): void {
    const sessions = SessionManager.listSessions();
    console.log(chalk.cyan('\n  📂 Historial de Conversaciones:'));
    if (sessions.length === 0) {
      console.log(chalk.dim('  (No hay conversaciones guardadas aún)'));
      return;
    }

    sessions.forEach((s, idx) => {
      const isCurrent = s.id === this.currentSession.id;
      const marker = isCurrent ? chalk.green('▶ [ACTUAL] ') : chalk.dim(`  [${idx + 1}] `);
      const dateStr = new Date(s.updatedAt).toLocaleString();
      console.log(`${marker}${chalk.bold(s.title)} ${chalk.dim(`(${s.messages.length} msgs · ${dateStr})`)}`);
      console.log(chalk.dim(`      ID: ${s.id}`));
    });
    console.log(chalk.dim('\n  Para retomar una conversación previa, escribe: /resume <número o ID>'));
  }

  private resumeSession(idOrIndex: string): void {
    const loaded = SessionManager.loadSession(idOrIndex);
    if (!loaded) {
      console.log(chalk.red(`\n  ✖ No se encontró ninguna conversación con el ID o número: "${idOrIndex}"`));
      return;
    }

    this.currentSession = loaded;
    this.targetUrl = loaded.targetUrl || this.targetUrl;
    console.log(chalk.green(`\n  ✓ Conversación reanudada: "${loaded.title}"`));
    console.log(chalk.dim(`    Mensajes cargados: ${loaded.messages.length} | Target: ${this.targetUrl}`));
  }

  private startNewSession(): void {
    this.currentSession = SessionManager.createSession(this.targetUrl);
    console.log(chalk.green('\n  ✨ Nueva conversación iniciada.'));
  }

  private launchFreebuff(): void {
    console.log(chalk.cyan('\n  🚀 Lanzando agente de codificación Freebuff...\n'));
    try {
      spawnSync('freebuff', [], { stdio: 'inherit', cwd: process.cwd() });
      this.printWelcome();
    } catch {
      console.log(chalk.yellow('  ▲ No se pudo iniciar Freebuff. Asegúrate de instalarlo con: npm install -g freebuff'));
    }
  }

  private async runLogin(url: string): Promise<void> {
    try {
      this.storageStatePath = await runInteractiveLogin({ targetUrl: url });
      this.targetUrl = url;
      this.currentSession.targetUrl = url;
      SessionManager.saveSession(this.currentSession);
      console.log(chalk.green(`  🔑 Sesión autenticada guardada. Ahora puedes ejecutar "/audit" para auditar pantallas privadas.`));
    } catch (err) {
      console.log(chalk.red(`  ✖ Error en login: ${err instanceof Error ? err.message : err}`));
    }
  }

  private async runAudit(url: string): Promise<void> {
    console.log(chalk.cyan(`\n  🚀 Iniciando auditoría UI/UX en ${url}...`));
    this.targetUrl = url;
    this.currentSession.targetUrl = url;

    try {
      const config = loadConfig({
        overrides: {
          target: { url },
          ...(this.storageStatePath ? { auth: { storageState: this.storageStatePath } } : {}),
        },
      });
      const orchestrator = new Orchestrator(config, this.aiProvider ?? undefined);
      const auditResult = await orchestrator.run();

      this.latestFindings = auditResult.findings;
      this.htmlReportPath = resolve(process.cwd(), './uiux-audit-results/report.html');
      SessionManager.saveSession(this.currentSession);

      console.log(chalk.green(`\n  ✓ Auditoría finalizada: ${this.latestFindings.length} hallazgos registrados.`));
      console.log(chalk.dim('  Puedes escribir "/inspect" para navegar los hallazgos o consultarme cualquier duda técnica.'));
    } catch (err) {
      console.log(chalk.red(`  ✖ Error durante la auditoría: ${err instanceof Error ? err.message : err}`));
    }
  }

  private async openInspector(): Promise<void> {
    if (this.latestFindings.length === 0) {
      console.log(chalk.yellow('\n  ▲ No hay hallazgos disponibles. Ejecuta primero "/audit".'));
      return;
    }

    const inspector = new InteractiveInspector(this.latestFindings, this.htmlReportPath);
    await inspector.run();
    this.printWelcome();
  }

  private openReport(): void {
    const reportPath = this.htmlReportPath || resolve(process.cwd(), './uiux-audit-results/report.html');
    if (!existsSync(reportPath)) {
      console.log(chalk.yellow('\n  ▲ Reporte HTML no encontrado. Ejecuta primero "/audit".'));
      return;
    }

    console.log(chalk.cyan(`\n  🌐 Abriendo reporte HTML: ${reportPath}`));
    const cmd =
      process.platform === 'darwin'
        ? `open "${reportPath}"`
        : process.platform === 'win32'
          ? `start "" "${reportPath}"`
          : `xdg-open "${reportPath}"`;
    exec(cmd);
  }

  private printSkills(): void {
    console.log(chalk.cyan('\n  🧠 Squad de Habilidades Especializadas (.agents/skills/):'));
    console.log(`  • ${chalk.bold('ui-explorer')}: Descubrimiento autónomo de estados y grafos de interacción.`);
    console.log(`  • ${chalk.bold('accessibility-reviewer')}: Auditoría WCAG 2.1 AA y árbol semántico.`);
    console.log(`  • ${chalk.bold('visual-reviewer')}: Análisis de jerarquía, contraste y densidad visual.`);
    console.log(`  • ${chalk.bold('ux-reviewer')}: Detección de sobrecarga cognitiva y claridad de feedback.`);
    console.log(`  • ${chalk.bold('responsive-reviewer')}: Pruebas en viewports desktop, tablet y móvil.`);
    console.log(`  • ${chalk.bold('consistency-reviewer')}: Inferencia de estilos y detección de anomalías.`);
    console.log(`  • ${chalk.bold('journey-tester')}: Validación de flujos de usuario paso a paso.`);
    console.log(`  • ${chalk.bold('finding-verifier')}: Reproducción autónoma y eliminación de falsos positivos.`);
  }

  private printStatus(): void {
    console.log(chalk.cyan('\n  📊 Estado de la Sesión:'));
    console.log(`  • Sesión actual:       ${chalk.bold(this.currentSession.id)}`);
    console.log(`  • Título:              ${chalk.bold(this.currentSession.title)}`);
    console.log(`  • Target URL actual:   ${chalk.bold(this.targetUrl)}`);
    console.log(`  • Hallazgos cargados:  ${chalk.bold(this.latestFindings.length)}`);
    console.log(`  • Mensajes en sesión:  ${chalk.bold(this.currentSession.messages.length)}`);
    console.log(`  • Motor IA activo:     ${this.aiProvider ? chalk.green(`${this.aiProvider.capabilities().modelName} (Conectado)`) : chalk.yellow('No configurado')}`);
  }

  private async queryAI(input: string): Promise<void> {
    if (!this.aiProvider) return;
    const model = this.aiProvider.capabilities().modelName;
    console.log(chalk.dim(`\n  Consultando a la IA (${model})... 🧠`));

    // Summary of findings for AI context
    const findingsSummary = this.latestFindings.length > 0
      ? `Audit Context: Target: ${this.targetUrl}, Total Findings in memory: ${this.latestFindings.length}. Sample findings:\n` +
        JSON.stringify(this.latestFindings.slice(0, 10).map((f) => ({
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          selector: f.evidence?.find((e) => e.type === 'selector')?.selector,
          recommendation: f.recommendation,
        })), null, 2)
      : `No audit findings loaded in memory yet. Target URL: ${this.targetUrl}`;

    const systemPrompt =
      'You are @uiux-auditor, an autonomous lead UI/UX & WCAG accessibility auditor and expert frontend engineer.\n\n' +
      `Target Application Context:\n${findingsSummary}\n\n` +
      'Instructions:\n' +
      '- Answer naturally, helpfully, and authentically in Spanish to whatever the user says or asks.\n' +
      '- As a dedicated UI/UX and accessibility auditor, always naturally guide and steer the conversation toward discovering, reviewing, analyzing, or fixing UI/UX, responsive design, and WCAG accessibility defects in web applications.\n' +
      '- If a target URL or audit findings exist, leverage them intelligently when helpful. If none are provided yet, proactively offer to audit their web application (e.g. asking for the target URL or suggesting /audit <url>).\n' +
      '- When providing code remediations, use clean, production-ready HTML/CSS/JS examples.\n' +
      '- Be concise, clear, and engaging.';

    const recentHistory = this.currentSession.messages.slice(-10);

    try {
      const response = await this.aiProvider.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          ...recentHistory,
          { role: 'user', content: input },
        ],
      });

      // Update session title if first turn
      if (this.currentSession.messages.length === 0) {
        this.currentSession.title = input.length > 40 ? `${input.slice(0, 40)}...` : input;
      }

      // Append messages to current session
      this.currentSession.messages.push({ role: 'user', content: input });
      this.currentSession.messages.push({ role: 'assistant', content: response.content });
      SessionManager.saveSession(this.currentSession);

      console.log(chalk.cyan('\n  🤖 @uiux-auditor:'));
      console.log(response.content);
    } catch (err) {
      console.log(chalk.red(`\n  ✖ Error consultando a la IA: ${err instanceof Error ? err.message : err}`));
    }
  }
}
