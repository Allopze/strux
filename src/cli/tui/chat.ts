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
import type { LLMProvider, CompletionMessage } from '../../providers/types.js';

export class AgentChatREPL {
  private targetUrl: string;
  private latestFindings: Finding[] = [];
  private htmlReportPath?: string;
  private storageStatePath?: string;
  private aiProvider?: LLMProvider | null;
  private conversationHistory: CompletionMessage[] = [];

  constructor(targetUrl: string = 'http://localhost:3333') {
    this.targetUrl = targetUrl;
    this.aiProvider = CommandCodeProvider.fromEnv();
    if (existsSync('./auth/storageState.json')) {
      this.storageStatePath = resolve('./auth/storageState.json');
    }
    this.loadPreviousAuditIfAvailable();
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

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan.bold('uiux-auditor ❯ '),
    });

    rl.prompt();

    rl.on('line', async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }

      if (['exit', 'quit', 'salir', '/exit', '/quit'].includes(input.toLowerCase())) {
        console.log(chalk.dim('\n  ¡Hasta luego! 👋\n'));
        rl.close();
        process.exit(0);
      }

      try {
        await this.handleUserInput(input);
      } catch (err) {
        console.log(chalk.red(`\n  ✖ Error: ${err instanceof Error ? err.message : err}`));
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
    console.log(chalk.cyan('│') + chalk.dim('  Comandos rápidos:                                                     ') + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /audit [url]  ') + chalk.dim('→ Iniciar auditoría completa') + ' '.repeat(26) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /login [url]  ') + chalk.dim('→ Iniciar sesión asistida (OAuth, 2FA, JWT)') + ' '.repeat(11) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /inspect      ') + chalk.dim('→ Abrir inspector interactivo de hallazgos') + ' '.repeat(14) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /report       ') + chalk.dim('→ Abrir reporte HTML en navegador') + ' '.repeat(23) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /freebuff     ') + chalk.dim('→ Abrir agente Freebuff (MiMo 2.5 gratis)') + ' '.repeat(17) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /skills       ') + chalk.dim('→ Ver habilidades del squad de agentes') + ' '.repeat(18) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /status       ') + chalk.dim('→ Ver estado de la sesión') + ' '.repeat(31) + chalk.cyan('│'));
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

    // 1. Slash commands
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

    // 2. All conversational queries go directly to Freebuff / AI Provider
    if (!this.aiProvider) {
      this.aiProvider = CommandCodeProvider.fromEnv();
    }

    if (this.aiProvider) {
      await this.queryAI(input);
    } else {
      console.log(chalk.cyan('\n  🤖 Freebuff es un agente de terminal autónomo que no requiere API Keys.'));
      console.log('  Tienes dos formas de usar Freebuff con UI/UX Auditor:');
      console.log(`  1. Escribe ${chalk.bold.green('/freebuff')} aquí para abrir el agente Freebuff con este proyecto cargado.`);
      console.log(`  2. O ejecuta ${chalk.bold.green('freebuff')} directamente en tu terminal.`);
      console.log(chalk.dim('     Freebuff leerá AGENTS.md, ejecutará auditorías y corregirá el código automáticamente.'));
      console.log('');
      console.log('  Comandos de herramientas disponibles:');
      console.log(`    ${chalk.cyan('/audit [url]')}   → Iniciar auditoría completa`);
      console.log(`    ${chalk.cyan('/login [url]')}   → Iniciar sesión asistida con navegador`);
      console.log(`    ${chalk.cyan('/inspect')}        → Abrir inspector interactivo de hallazgos`);
      console.log(`    ${chalk.cyan('/report')}         → Abrir reporte HTML en navegador`);
      console.log(`    ${chalk.cyan('/freebuff')}       → Abrir el agente de codificación Freebuff`);
    }
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
      console.log(chalk.green(`  🔑 Sesión autenticada guardada. Ahora puedes ejecutar "/audit" para auditar pantallas privadas.`));
    } catch (err) {
      console.log(chalk.red(`  ✖ Error durante la sesión de login: ${err instanceof Error ? err.message : err}`));
    }
  }

  private async runAudit(url: string): Promise<void> {
    this.targetUrl = url;
    console.log(chalk.cyan(`\n  🚀 Iniciando auditoría completa en ${url}...\n`));

    const overrides: Record<string, unknown> = {
      target: { url },
      reports: { html: true, markdown: true, json: true, outputDir: './uiux-audit-results' },
    };

    if (this.storageStatePath && existsSync(this.storageStatePath)) {
      overrides['auth'] = { storageState: this.storageStatePath };
      console.log(chalk.dim(`  Usando sesión autenticada: ${this.storageStatePath}`));
    }

    const config = loadConfig({ overrides });

    const orchestrator = new Orchestrator(config, this.aiProvider ?? undefined);
    const result = await orchestrator.run();
    this.latestFindings = result.findings;
    this.htmlReportPath = resolve(process.cwd(), './uiux-audit-results/report.html');

    console.log(chalk.green(`\n  ✓ Auditoría completada con éxito. ${result.findings.length} hallazgos registrados.`));
    console.log(chalk.dim('  Puedes escribir "/inspect" para navegar los hallazgos o consultar al agente con Freebuff.'));
  }

  private async openInspector(): Promise<void> {
    if (this.latestFindings.length === 0) {
      console.log(chalk.yellow('\n  ▲ No hay hallazgos disponibles. Ejecuta primero "/audit http://localhost:3333".'));
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
    console.log(`  • Target URL actual:   ${chalk.bold(this.targetUrl)}`);
    console.log(`  • Hallazgos cargados:  ${chalk.bold(this.latestFindings.length)}`);
    console.log(`  • Motor IA activo:     ${this.aiProvider ? chalk.green('Freebuff / AI Connected') : chalk.yellow('No configurado (usa comandos /audit, /login, etc.)')}`);
  }

  private async queryAI(input: string): Promise<void> {
    if (!this.aiProvider) return;
    const model = this.aiProvider.capabilities().modelName;
    console.log(chalk.dim(`\n  Consultando a la IA (${model})... 🧠`));

    // Summary of findings for AI context
    const findingsSummary = this.latestFindings.length > 0
      ? `Audit Context: Target: ${this.targetUrl}, Total Findings: ${this.latestFindings.length}. Sample findings:\n` +
        JSON.stringify(this.latestFindings.slice(0, 8).map(f => ({
          category: f.category,
          severity: f.severity,
          title: f.title,
          description: f.description,
          selector: f.evidence?.find(e => e.type === 'selector')?.selector,
          recommendation: f.recommendation,
        })), null, 2)
      : `No audit findings loaded in memory yet. Target URL: ${this.targetUrl}`;

    const systemPrompt =
      'You are @uiux-auditor, an expert autonomous UI/UX and WCAG accessibility engineer.\n\n' +
      `Current App Status:\n${findingsSummary}\n\n` +
      'Conversation Guidelines:\n' +
      '1. For simple greetings or casual small talk (e.g. "hola", "buenas", "hey"), greet the user back warmly, briefly, and naturally in Spanish. ' +
      'Briefly mention the loaded target and findings count, and ask what they would like to inspect or fix. DO NOT output unsolicited tables, code, or huge report breakdowns on a simple greeting.\n' +
      '2. When the user asks a question, requests analysis, or asks how to fix an issue, provide deep, prioritized, and actionable technical advice with clear code snippets.\n' +
      '3. Be conversational, natural, and helpful.';

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...this.conversationHistory.slice(-8), // Keep recent conversation context
      { role: 'user' as const, content: input },
    ];

    try {
      const response = await this.aiProvider.complete({
        messages,
      });

      // Save turn into history
      this.conversationHistory.push({ role: 'user', content: input });
      this.conversationHistory.push({ role: 'assistant', content: response.content });

      console.log(chalk.cyan('\n  🤖 @uiux-auditor:'));
      console.log(response.content);
    } catch (err) {
      console.log(chalk.red(`\n  ✖ Error consultando a la IA: ${err instanceof Error ? err.message : err}`));
    }
  }
}
