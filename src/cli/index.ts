#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, generateDefaultConfig } from '../core/config/loader.js';
import { Orchestrator } from '../agents/orchestrator.js';
import { CommandCodeProvider } from '../providers/commandcode.js';
import type { LLMProvider } from '../providers/types.js';
import { LiveDashboard } from './tui/dashboard.js';
import { InteractiveInspector } from './tui/inspector.js';
import { AgentChatREPL } from './tui/chat.js';
import { runInteractiveLogin } from '../core/browser/auth.js';

const program = new Command();

program
  .name('uiux-audit')
  .description('Autonomous UI/UX auditor powered by Playwright and AI')
  .version('0.1.0');

// ── audit ─────────────────────────────────────────────────────────────
program
  .command('audit [url]')
  .description('Run a full UI/UX audit on the target application')
  .option('-c, --config <path>', 'Path to config file')
  .option('--repo <path>', 'Path to source code repository')
  .option('--storage-state <path>', 'Path to Playwright storage state JSON')
  .option('--login', 'Run interactive visual login before starting the audit')
  .option('--provider <name>', 'AI provider (commandcode)')
  .option('--model <name>', 'AI model name')
  .option('--no-ai', 'Disable AI analysis')
  .option('--no-verify', 'Disable finding verification')
  .option('--output <dir>', 'Output directory for reports')
  .option('--max-states <n>', 'Maximum states to explore', parseInt)
  .option('--max-depth <n>', 'Maximum exploration depth', parseInt)
  .option('--html', 'Generate HTML report')
  .option('--no-tui', 'Disable live terminal dashboard')
  .action(async (url?: string, options?: Record<string, unknown>) => {
    try {
      const opts = options ?? {};

      // If interactive login requested before audit
      if (opts['login']) {
        const loginUrl = url ?? 'http://localhost:3000';
        const savedAuth = await runInteractiveLogin({ targetUrl: loginUrl });
        opts['storageState'] = savedAuth;
      }

      // Build overrides from CLI flags
      const overrides: Record<string, unknown> = {};

      if (url) {
        overrides['target'] = { url };
      }
      if (opts['repo']) {
        overrides['repo'] = { path: resolve(opts['repo'] as string) };
      }
      if (opts['storageState']) {
        overrides['auth'] = { storageState: resolve(opts['storageState'] as string) };
      }
      if (opts['output']) {
        overrides['reports'] = { outputDir: opts['output'] as string };
      }
      if (opts['maxStates'] || opts['maxDepth']) {
        overrides['exploration'] = {
          ...(opts['maxStates'] ? { maxStates: opts['maxStates'] } : {}),
          ...(opts['maxDepth'] ? { maxDepth: opts['maxDepth'] } : {}),
        };
      }
      if (opts['ai'] === false) {
        overrides['ai'] = { enabled: false };
      }
      if (opts['verify'] === false) {
        overrides['verification'] = { enabled: false };
      }
      if (opts['html']) {
        overrides['reports'] = {
          ...((overrides['reports'] as Record<string, unknown>) ?? {}),
          html: true,
        };
      }

      const config = loadConfig({
        configPath: opts['config'] as string | undefined,
        overrides,
      });

      // Set up AI provider if requested
      let provider: LLMProvider | undefined;

      if (config.ai.enabled) {
        if (opts['provider'] === 'commandcode' || config.ai.provider === 'commandcode' || !config.ai.provider) {
          const modelOverride = (opts['model'] as string) || undefined;
          const cc = CommandCodeProvider.fromEnv(modelOverride ? { model: modelOverride } : undefined);
          if (cc) {
            provider = cc;
            console.log(chalk.dim(`  AI provider: CommandCode (${cc.capabilities().modelName})`));
          } else {
            console.log(chalk.yellow('  ▲ AI enabled but API credentials/model not configured (COMMANDCODE_API_KEY, COMMANDCODE_BASE_URL, COMMANDCODE_MODEL)'));
            console.log(chalk.dim('    Running in deterministic-first mode (0 tokens)'));
          }
        }
      }

      const dashboard = opts['tui'] !== false ? new LiveDashboard(config.target.url) : undefined;
      const orchestrator = new Orchestrator({ config, provider, dashboard });
      await orchestrator.run();
    } catch (err) {
      console.error(chalk.red(`\n  ✖ Audit failed: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

// ── login ─────────────────────────────────────────────────────────────
program
  .command('login [url]')
  .description('Interactive visual login to capture session cookies/tokens for authentication')
  .option('-o, --output <path>', 'Output storage state path', './auth/storageState.json')
  .action(async (url?: string, options?: { output?: string }) => {
    try {
      const targetUrl = url ?? 'http://localhost:3000';
      await runInteractiveLogin({
        targetUrl,
        outputPath: options?.output,
      });
    } catch (err) {
      console.error(chalk.red(`\n  ✖ Login session failed: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });

// ── chat ──────────────────────────────────────────────────────────────
program
  .command('chat [url]')
  .description('Start an interactive terminal chat with @uiux-auditor')
  .action(async (url?: string) => {
    const targetUrl = url ?? 'http://localhost:3333';
    const chat = new AgentChatREPL(targetUrl);
    await chat.start();
  });

// ── inspect ───────────────────────────────────────────────────────────
program
  .command('inspect [outputDir]')
  .description('Interactively browse and filter audit findings in terminal')
  .action(async (outputDir?: string) => {
    const dir = outputDir ?? './uiux-audit-results';
    const jsonPath = resolve(process.cwd(), dir, 'report.json');
    const htmlPath = resolve(process.cwd(), dir, 'report.html');

    if (!existsSync(jsonPath)) {
      console.log(chalk.yellow(`  ▲ Report not found at ${jsonPath}. Run an audit first: npx uiux-audit audit <url>`));
      return;
    }

    try {
      const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      const findings = data.findings || [];
      const inspector = new InteractiveInspector(findings, existsSync(htmlPath) ? htmlPath : undefined);
      await inspector.run();
    } catch (err) {
      console.error(chalk.red(`  ✖ Failed to load report: ${err instanceof Error ? err.message : err}`));
    }
  });

// ── init ──────────────────────────────────────────────────────────────
program
  .command('init [url]')
  .description('Initialize audit configuration and native AI agent squad')
  .action((url?: string) => {
    const targetUrl = url ?? 'http://localhost:3000';
    const configPath = 'uiux-audit.config.yaml';

    if (existsSync(configPath)) {
      console.log(chalk.yellow(`  ▲ ${configPath} already exists`));
    } else {
      const content = generateDefaultConfig(targetUrl);
      writeFileSync(configPath, content, 'utf-8');
      console.log(chalk.green(`  ✓ Created ${configPath}`));
    }

    if (existsSync('.agents')) {
      console.log(chalk.green(`  ✓ Native AI Agent Squad active (.agents/)`));
    }

    console.log('');
    console.log(chalk.dim(`  Run audit via CLI:  npx uiux-audit audit ${targetUrl}`));
    console.log(chalk.dim(`  Or chat with agent: npx uiux-audit chat ${targetUrl}`));
    console.log(chalk.dim(`  Or invoke in IDE:   @uiux-auditor`));
    console.log('');
  });

// ── doctor ────────────────────────────────────────────────────────────
program
  .command('doctor')
  .description('Check system requirements and configuration')
  .action(async () => {
    console.log('');
    console.log(chalk.bold('  🩺 UI/UX Audit Doctor'));
    console.log('');

    let allGood = true;

    // Check Node.js version
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1), 10);
    if (major >= 20) {
      console.log(chalk.green(`  ✓ Node.js ${nodeVersion}`));
    } else {
      console.log(chalk.red(`  ✖ Node.js ${nodeVersion} (requires >= 20)`));
      allGood = false;
    }

    // Check Playwright
    try {
      const pwVersion = execSync('npx playwright --version 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();
      console.log(chalk.green(`  ✓ Playwright ${pwVersion}`));
    } catch {
      console.log(chalk.red('  ✖ Playwright not found'));
      console.log(chalk.dim('    Run: npx playwright install chromium'));
      allGood = false;
    }

    // Check Playwright browsers
    try {
      execSync('npx playwright install --dry-run chromium 2>/dev/null', {
        encoding: 'utf-8',
        timeout: 10000,
      });
      console.log(chalk.green('  ✓ Chromium browser available'));
    } catch {
      console.log(chalk.yellow('  ▲ Chromium may not be installed'));
      console.log(chalk.dim('    Run: npx playwright install chromium'));
    }

    // Check config file
    const configFiles = [
      'uiux-audit.config.yaml',
      'uiux-audit.config.yml',
      '.uiux-audit.yaml',
      '.uiux-audit.yml',
    ];
    const foundConfig = configFiles.find((f) => existsSync(f));
    if (foundConfig) {
      console.log(chalk.green(`  ✓ Config file: ${foundConfig}`));

      try {
        const config = loadConfig({ configPath: foundConfig });
        console.log(chalk.green(`  ✓ Config valid (target: ${config.target.url})`));

        // Check storage state
        if (config.auth?.storageState) {
          if (existsSync(config.auth.storageState)) {
            console.log(chalk.green(`  ✓ Storage state: ${config.auth.storageState}`));
          } else {
            console.log(chalk.red(`  ✖ Storage state not found: ${config.auth.storageState}`));
            allGood = false;
          }
        }
      } catch (err) {
        console.log(chalk.red(`  ✖ Config invalid: ${err instanceof Error ? err.message : err}`));
        allGood = false;
      }
    } else {
      console.log(chalk.yellow('  ▲ No config file found'));
      console.log(chalk.dim('    Run: uiux-audit init'));
    }

    // Check CommandCode / OpenAI env vars
    const ccKey = process.env['COMMANDCODE_API_KEY'] || process.env['OPENAI_API_KEY'];
    const ccModel = process.env['COMMANDCODE_MODEL'] || process.env['OPENAI_MODEL'];
    if (ccKey) {
      console.log(chalk.green(`  ✓ CommandCode / AI API Key configured (model: ${ccModel || 'gpt-4o'})`));
    } else {
      console.log(chalk.dim('  ○ CommandCode / AI API Key not configured (optional)'));
    }

    console.log('');
    if (allGood) {
      console.log(chalk.green('  All checks passed! ✨'));
    } else {
      console.log(chalk.yellow('  Some issues need attention.'));
    }
    console.log('');
  });

if (process.argv.length <= 2) {
  const chat = new AgentChatREPL('http://localhost:3000');
  await chat.start();
} else {
  program.parse();
}
