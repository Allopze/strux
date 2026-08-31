import chalk from 'chalk';
import readline from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exec } from 'node:child_process';
import type { Finding } from '../../core/findings/types.js';
import { Orchestrator } from '../../agents/orchestrator.js';
import { loadConfig } from '../../core/config/loader.js';
import { CommandCodeProvider } from '../../providers/commandcode.js';
import { InteractiveInspector } from './inspector.js';
import { runInteractiveLogin } from '../../core/browser/auth.js';

export class AgentChatREPL {
  private targetUrl: string;
  private latestFindings: Finding[] = [];
  private htmlReportPath?: string;
  private storageStatePath?: string;
  private aiProvider?: CommandCodeProvider | null;

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
    console.log(chalk.cyan('┌────────────────────────────────────────────────────────────────────────┐'));
    console.log(chalk.cyan('│') + chalk.bold.white('  🤖 UI/UX AUDITOR — Interactive Agent Chat REPL') + ' '.repeat(24) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.dim('  Escribe tus instrucciones en lenguaje natural o usa comandos directos. ') + chalk.cyan('│'));
    console.log(chalk.cyan('├────────────────────────────────────────────────────────────────────────┤'));
    console.log(chalk.cyan('│') + chalk.dim('  Comandos rápidos:                                                     ') + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /audit [url]  ') + chalk.dim('→ Iniciar auditoría completa') + ' '.repeat(26) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /login [url]  ') + chalk.dim('→ Iniciar sesión asistida (OAuth, 2FA, JWT)') + ' '.repeat(11) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /inspect      ') + chalk.dim('→ Abrir inspector interactivo de hallazgos') + ' '.repeat(14) + chalk.cyan('│'));
    console.log(chalk.cyan('│') + chalk.white('  • /report       ') + chalk.dim('→ Abrir reporte HTML en navegador') + ' '.repeat(23) + chalk.cyan('│'));
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
    const lower = input.toLowerCase();

    // 1. Greetings
    if (/^(hola|buenas|hey|hello|hi|buenos d[ií]as|buenas tardes|que tal)/i.test(lower)) {
      console.log(chalk.cyan('\n  👋 ¡Hola! Soy tu asistente @uiux-auditor.'));
      if (this.latestFindings.length > 0) {
        console.log(`  Tengo cargados en memoria ${chalk.bold(this.latestFindings.length)} hallazgos de ${chalk.bold(this.targetUrl)}.`);
      } else {
        console.log(`  Listo para auditar cualquier aplicación web.`);
      }
      console.log('');
      console.log(`  Puedes pedirme:`);
      console.log(`  • ${chalk.bold('"Audita http://..."')} o ${chalk.cyan('/audit [url]')} para auditar una web.`);
      console.log(`  • ${chalk.bold('"/login [url]"')} para iniciar sesión con ventana asistida.`);
      console.log(`  • ${chalk.bold('"/inspect"')} para navegar los hallazgos con las flechas del teclado.`);
      console.log(`  • O preguntarme sobre ${chalk.cyan('accesibilidad')}, ${chalk.cyan('responsive')}, ${chalk.cyan('errores críticos')} o ${chalk.cyan('código')}.`);
      return;
    }

    // 2. Slash commands & intent matching
    if (lower.startsWith('/login') || lower.includes('iniciar sesion') || lower.includes('inicia sesión') || lower.includes('hacer login') || lower.includes('autenticar')) {
      const parts = input.split(/\s+/);
      const url = parts.find((p) => p.startsWith('http://') || p.startsWith('https://')) || this.targetUrl;
      await this.runLogin(url);
      return;
    }

    if (lower.startsWith('/audit') || lower.startsWith('audita')) {
      const parts = input.split(/\s+/);
      const url = parts.find((p) => p.startsWith('http://') || p.startsWith('https://')) || this.targetUrl;
      await this.runAudit(url);
      return;
    }

    if (lower.startsWith('/inspect') || lower.includes('inspeccionar') || lower.includes('ver hallazgos')) {
      await this.openInspector();
      return;
    }

    if (lower.startsWith('/report') || lower.includes('abrir reporte') || lower.includes('ver reporte')) {
      this.openReport();
      return;
    }

    if (lower.startsWith('/skills') || lower.includes('habilidades') || lower.includes('que agentes tienes')) {
      this.printSkills();
      return;
    }

    if (lower.startsWith('/status') || lower.includes('estado')) {
      this.printStatus();
      return;
    }

    if (lower.startsWith('/help') || lower.startsWith('ayuda')) {
      this.printWelcome();
      return;
    }

    // 2. Query findings or AI reasoning
    if (this.aiProvider) {
      await this.queryAI(input);
    } else {
      this.handleDeterministicQuery(lower);
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
    console.log(chalk.dim('  Puedes escribir "/inspect" para navegar los hallazgos o preguntar "¿cuáles son los más graves?".'));
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
    console.log(`  • Motor IA activo:     ${this.aiProvider ? chalk.green('CommandCode / OpenAI') : chalk.dim('Modo Determinista Local (0 tokens)')}`);
  }

  private handleDeterministicQuery(lower: string): void {
    if (this.latestFindings.length === 0) {
      console.log(chalk.yellow('\n  ▲ No hay auditoría en memoria. Ejecuta primero "/audit" o escribe "audita http://localhost:3333".'));
      return;
    }

    if (lower.includes('accesib') || lower.includes('wcag')) {
      const a11y = this.latestFindings.filter((f) => f.category === 'ACCESSIBILITY');
      console.log(chalk.bold.cyan(`\n  ♿ Hallazgos de Accesibilidad (${a11y.length}):`));
      for (const f of a11y.slice(0, 8)) {
        console.log(`  • [${f.severity}] ${chalk.bold(f.title)}`);
        if (f.recommendation) console.log(`    💡 ${chalk.dim(f.recommendation)}`);
      }
      return;
    }

    if (lower.includes('responsive') || lower.includes('móvil') || lower.includes('movil')) {
      const resp = this.latestFindings.filter((f) => f.category === 'RESPONSIVE');
      console.log(chalk.bold.cyan(`\n  📱 Hallazgos Responsive (${resp.length}):`));
      if (resp.length === 0) {
        console.log(chalk.green('  ✓ No se encontraron problemas de overflow horizontal ni clipping responsive.'));
      } else {
        for (const f of resp) {
          console.log(`  • [${f.severity}] ${f.title}`);
        }
      }
      return;
    }

    if (lower.includes('crític') || lower.includes('critic') || lower.includes('alto') || lower.includes('high') || lower.includes('grave')) {
      const high = this.latestFindings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
      console.log(chalk.bold.red(`\n  🔴 Hallazgos Críticos y Altos (${high.length}):`));
      if (high.length === 0) {
        console.log(chalk.green('  ✓ No se detectaron problemas de severidad CRITICAL ni HIGH.'));
      } else {
        for (const f of high) {
          console.log(`  • ${chalk.bold(f.title)} (${f.category})`);
          if (f.recommendation) console.log(`    💡 ${f.recommendation}`);
        }
      }
      return;
    }

    if (lower.includes('código') || lower.includes('codigo') || lower.includes('archivo') || lower.includes('fuente')) {
      const withFiles = this.latestFindings.filter((f) => f.suspectedSourceFiles && f.suspectedSourceFiles.length > 0);
      console.log(chalk.bold.cyan(`\n  📁 Archivos fuente vinculados (${withFiles.length}):`));
      for (const f of withFiles.slice(0, 8)) {
        console.log(`  • ${f.title}`);
        for (const s of f.suspectedSourceFiles!) {
          console.log(`    ↳ ${chalk.green(s.file)}${s.line ? ':' + s.line : ''} (conf: ${Math.round(s.confidence * 100)}%)`);
        }
      }
      return;
    }

    // Default summary
    console.log(chalk.cyan(`\n  🤖 Resumen del Agente:`));
    console.log(`  He analizado ${this.targetUrl} y registrado ${this.latestFindings.length} hallazgos.`);
    console.log(`  • Puedes consultar sobre "accesibilidad", "responsive", "hallazgos críticos" o "código".`);
    console.log(`  • También puedes escribir "/inspect" para navegar interactivamente con las flechas del teclado.`);
  }

  private async queryAI(input: string): Promise<void> {
    if (!this.aiProvider) return;
    console.log(chalk.dim('\n  Pensando... 🧠'));

    const context = `Target: ${this.targetUrl}\nTotal findings: ${this.latestFindings.length}\nSample findings:\n` +
      JSON.stringify(this.latestFindings.slice(0, 5), null, 2);

    try {
      const response = await this.aiProvider.complete({
        messages: [
          { role: 'system', content: 'You are @uiux-auditor, an expert UI/UX and accessibility lead engineer. Respond concisely in Spanish.' },
          { role: 'user', content: `Context:\n${context}\n\nUser Question:\n${input}` },
        ],
      });

      console.log(chalk.cyan('\n  🤖 @uiux-auditor:'));
      console.log(response.content);
    } catch (err) {
      console.log(chalk.yellow(`  ▲ Error consultando al modelo: ${err instanceof Error ? err.message : err}`));
      this.handleDeterministicQuery(input.toLowerCase());
    }
  }
}
