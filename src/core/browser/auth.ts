import { chromium } from 'playwright';
import chalk from 'chalk';
import readline from 'node:readline';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export interface InteractiveLoginOptions {
  targetUrl: string;
  outputPath?: string;
  timeoutMs?: number;
}

/**
 * Open a visual browser window to allow the user to log in manually
 * (supporting SSO, Google OAuth, 2FA, Captchas, passwords), and save
 * the resulting cookies/JWT/storageState for automated auditing.
 */
export async function runInteractiveLogin(options: InteractiveLoginOptions): Promise<string> {
  const targetUrl = options.targetUrl;
  const outputPath = resolve(process.cwd(), options.outputPath ?? './auth/storageState.json');

  // Ensure output directory exists
  mkdirSync(dirname(outputPath), { recursive: true });

  console.log('');
  console.log(chalk.cyan('┌────────────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│') + chalk.bold.white('  🔐 UI/UX Auditor — Interactive Login Session') + ' '.repeat(26) + chalk.cyan('│'));
  console.log(chalk.cyan('├────────────────────────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│') + `  Target URL: ${chalk.bold(targetUrl.padEnd(57))}` + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.dim('  Se abrirá una ventana de navegador para que inicies sesión.            ') + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.dim('  Soporta credenciales, Google, GitHub, Auth0, 2FA y Magic Links.        ') + chalk.cyan('│'));
  console.log(chalk.cyan('└────────────────────────────────────────────────────────────────────────┘'));
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null,
  });

  const page = await context.newPage();

  try {
    console.log(chalk.dim(`  Navegando a ${targetUrl}...`));
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.log(chalk.yellow(`  ▲ Aviso al cargar URL inicial: ${err instanceof Error ? err.message : err}`));
  }

  console.log('');
  console.log(chalk.green.bold('  👉 Por favor, inicia sesión en la ventana del navegador.'));
  console.log(chalk.yellow.bold('  👉 Presiona [Enter] en esta terminal cuando hayas terminado el login...'));
  console.log('');

  await waitForEnterKey();

  console.log(chalk.dim('  Guardando cookies y tokens de sesión...'));
  await context.storageState({ path: outputPath });
  await browser.close();

  console.log('');
  console.log(chalk.green(`  ✓ Sesión guardada con éxito en: ${chalk.bold(outputPath)}`));
  console.log(chalk.dim('  Las próximas auditorías utilizarán automáticamente esta sesión.'));
  console.log('');

  return outputPath;
}

function waitForEnterKey(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}
