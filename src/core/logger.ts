import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_PREFIX: Record<LogLevel, string> = {
  debug: chalk.gray('○'),
  info: chalk.blue('●'),
  warn: chalk.yellow('▲'),
  error: chalk.red('✖'),
};

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(options: Partial<LoggerOptions> = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix ?? '';
  }

  child(prefix: string): Logger {
    const combinedPrefix = this.prefix ? `${this.prefix}/${prefix}` : prefix;
    return new Logger({ level: this.level, prefix: combinedPrefix });
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  progress(label: string, current: number, total: number): void {
    if (LEVEL_PRIORITY[this.level] > LEVEL_PRIORITY.info) return;
    const pct = Math.round((current / total) * 100);
    const bar = this.progressBar(current, total, 20);
    const prefix = this.prefix ? chalk.cyan(`[${this.prefix}]`) : '';
    process.stderr.write(
      `\r${prefix} ${bar} ${chalk.dim(`${pct}%`)} ${label} (${current}/${total})`
    );
    if (current >= total) {
      process.stderr.write('\n');
    }
  }

  private progressBar(current: number, total: number, width: number): string {
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;

    const prefix = this.prefix ? chalk.cyan(`[${this.prefix}]`) : '';
    const timestamp = chalk.dim(new Date().toISOString().slice(11, 19));
    const icon = LEVEL_PREFIX[level];

    const parts = [timestamp, icon, prefix, message].filter(Boolean);
    const formatted = parts.join(' ');

    if (level === 'error') {
      console.error(formatted, ...args);
    } else if (level === 'warn') {
      console.warn(formatted, ...args);
    } else {
      console.log(formatted, ...args);
    }
  }
}

export const logger = new Logger();
