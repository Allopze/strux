import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { AuditConfig } from '../config/schema.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Browser' });

export interface BrowserWorker {
  id: number;
  context: BrowserContext;
  page: Page;
}

/**
 * Manages Playwright browser lifecycle including launch, context creation,
 * and worker pool management.
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private workers: BrowserWorker[] = [];
  private config: AuditConfig;

  constructor(config: AuditConfig) {
    this.config = config;
  }

  async launch(): Promise<void> {
    log.info('Launching browser...');

    // Auto-discover user-space libraries if system libraries aren't globally installed
    const home = process.env['HOME'] || '';
    const userLibDir = `${home}/.local/playwright-deps/root/usr/lib/x86_64-linux-gnu`;
    if (home && !process.env['LD_LIBRARY_PATH']?.includes(userLibDir)) {
      process.env['LD_LIBRARY_PATH'] = process.env['LD_LIBRARY_PATH']
        ? `${userLibDir}:${process.env['LD_LIBRARY_PATH']}`
        : userLibDir;
    }

    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-software-rasterizer',
      ],
    });
    this.browser.on('disconnected', () => {
      log.debug('Browser disconnected');
      this.browser = null;
    });
    log.info('Browser launched');
  }

  async ensureBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      await this.launch();
    }
    return this.browser!;
  }

  async createWorker(id: number): Promise<BrowserWorker> {
    await this.ensureBrowser();

    const contextOptions: Record<string, unknown> = {
      viewport: {
        width: Object.values(this.config.viewports)[0]?.width ?? 1440,
        height: Object.values(this.config.viewports)[0]?.height ?? 900,
      },
      ignoreHTTPSErrors: true,
    };

    // Load storage state for auth
    if (this.config.auth?.storageState) {
      contextOptions['storageState'] = this.config.auth.storageState;
    }

    const browser = await this.ensureBrowser();
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    const worker: BrowserWorker = { id, context, page };
    this.workers.push(worker);

    log.debug(`Worker ${id} created`);
    return worker;
  }

  async createPool(size: number): Promise<BrowserWorker[]> {
    const workers: BrowserWorker[] = [];
    for (let i = 0; i < size; i++) {
      workers.push(await this.createWorker(i));
    }
    return workers;
  }

  async createContextWithViewport(
    width: number,
    height: number
  ): Promise<{ context: BrowserContext; page: Page }> {
    const browser = await this.ensureBrowser();

    const contextOptions: Record<string, unknown> = {
      viewport: { width, height },
      ignoreHTTPSErrors: true,
    };

    if (this.config.auth?.storageState) {
      contextOptions['storageState'] = this.config.auth.storageState;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    return { context, page };
  }

  async getOrCreateActiveWorker(id: number = 0): Promise<BrowserWorker> {
    const existing = this.workers.find((w) => w.id === id);
    if (existing && !existing.page.isClosed()) {
      return existing;
    }
    if (existing) {
      await existing.context.close().catch(() => {});
      this.workers = this.workers.filter((w) => w.id !== id);
    }
    return this.createWorker(id);
  }

  async closeWorker(worker: BrowserWorker): Promise<void> {
    await worker.context.close().catch(() => {});
    this.workers = this.workers.filter((w) => w.id !== worker.id);
  }

  async close(): Promise<void> {
    for (const worker of this.workers) {
      await worker.context.close().catch(() => {});
    }
    this.workers = [];

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      log.info('Browser closed');
    }
  }

  getBrowser(): Browser {
    if (!this.browser) throw new Error('Browser not launched');
    return this.browser;
  }
}
