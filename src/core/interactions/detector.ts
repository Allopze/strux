import type { Page } from 'playwright';
import type { InteractiveElement, ActionRisk } from '../states/types.js';

// Selectors for interactive elements
const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="link"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  'summary',
  '[onclick]',
  '[tabindex]:not([tabindex="-1"])',
  'label[for]',
].join(', ');

// Patterns for destructive actions
const DESTRUCTIVE_PATTERNS = [
  /\b(delete|eliminar|borrar|destroy|remove|quitar)\b/i,
  /\b(cerrar\s*cuenta|close\s*account|cancel\s*contract|cancelar\s*contrato)\b/i,
];

const MUTATING_PATTERNS = [
  /\b(pagar|comprar|buy|purchase|pay|enviar\s*pago|send\s*payment)\b/i,
  /\b(submit|enviar|confirmar|confirm|save|guardar|create|crear)\b/i,
  /\b(update|actualizar|edit|editar|modify|modificar)\b/i,
];

const LOGOUT_PATTERNS = [
  /\b(logout|log\s*out|sign\s*out|cerrar\s*sesi[oó]n|salir)\b/i,
];

const SAFE_PATTERNS = [
  /\b(search|buscar|filter|filtrar|sort|ordenar)\b/i,
  /\b(view|ver|details|detalles|show|mostrar|open|abrir)\b/i,
  /\b(back|volver|cancel|cancelar|close|cerrar|dismiss)\b/i,
  /\b(next|siguiente|previous|anterior|prev)\b/i,
];

/**
 * Detect all interactive elements on a page in a single atomic evaluate call.
 */
export async function detectInteractiveElements(
  page: Page,
  maxElements: number = 100
): Promise<InteractiveElement[]> {
  try {
    const rawElements = await page.evaluate((selectorString: string) => {
      function generateDomSelector(el: Element): string {
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
        if (testId) return `[data-testid="${testId}"]`;

        if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;

        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) {
          const tag = el.tagName.toLowerCase();
          return `${tag}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
        }

        const name = (el as HTMLInputElement).name;
        if (name && ['input', 'select', 'textarea'].includes(el.tagName.toLowerCase())) {
          return `${el.tagName.toLowerCase()}[name="${name}"]`;
        }

        const path: string[] = [];
        let current: Element | null = el;
        while (current && current !== document.body && current !== document.documentElement) {
          const tag = current.tagName.toLowerCase();
          const parent: Element | null = current.parentElement;
          if (parent) {
            const siblings: Element[] = Array.from(parent.children);
            const sameTag = siblings.filter((s) => s.tagName === current!.tagName);
            if (sameTag.length > 1) {
              const index = sameTag.indexOf(current) + 1;
              path.unshift(`${tag}:nth-of-type(${index})`);
            } else {
              path.unshift(tag);
            }
          } else {
            path.unshift(tag);
          }
          current = parent;
        }
        return path.join(' > ') || el.tagName.toLowerCase();
      }

      const results: Array<{
        selector: string;
        tag: string;
        role?: string;
        text: string;
        ariaLabel?: string;
        type?: string;
        href?: string;
        isVisible: boolean;
        isEnabled: boolean;
        boundingBox: { x: number; y: number; width: number; height: number } | null;
        dataTestId?: string;
        classes: string[];
        id?: string;
      }> = [];

      const nodes = Array.from(document.querySelectorAll(selectorString));

      for (const node of nodes) {
        const htmlEl = node as HTMLElement;
        const rect = htmlEl.getBoundingClientRect();
        const style = window.getComputedStyle(htmlEl);

        const isVisible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          (htmlEl.offsetParent !== null || htmlEl.tagName === 'BODY' || style.position === 'fixed');

        const isDisabled =
          (htmlEl as HTMLButtonElement).disabled === true ||
          htmlEl.getAttribute('aria-disabled') === 'true' ||
          htmlEl.classList.contains('disabled');

        const isEnabled = !isDisabled;

        const tag = htmlEl.tagName.toLowerCase();
        const role = htmlEl.getAttribute('role') || undefined;
        const ariaLabel = htmlEl.getAttribute('aria-label') || undefined;
        const text = (htmlEl.textContent || '').trim().slice(0, 200);
        const type = htmlEl.getAttribute('type') || undefined;
        const href = htmlEl.getAttribute('href') || undefined;
        const dataTestId = htmlEl.getAttribute('data-testid') || htmlEl.getAttribute('data-test-id') || undefined;
        const id = htmlEl.id || undefined;
        const classes = Array.from(htmlEl.classList);

        const boundingBox = isVisible && rect.width > 0 && rect.height > 0 ? {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        } : null;

        const selector = generateDomSelector(htmlEl);

        results.push({
          selector,
          tag,
          role,
          text: text || ariaLabel || '',
          ariaLabel,
          type,
          href,
          isVisible,
          isEnabled,
          boundingBox,
          dataTestId,
          classes,
          id,
        });
      }

      return results;
    }, INTERACTIVE_SELECTORS);

    return rawElements.slice(0, maxElements).map((el) => ({
      ...el,
      risk: classifyRisk(el.text, el.tag, el.type, el.href),
    }));
  } catch {
    return [];
  }
}

/**
 * Classify the risk level of interacting with an element.
 */
export function classifyRisk(
  text: string,
  tag: string,
  type?: string,
  href?: string
): ActionRisk {
  const combined = text.toLowerCase();

  // Check logout first — treat as destructive in audit context
  for (const pattern of LOGOUT_PATTERNS) {
    if (pattern.test(combined)) return 'DESTRUCTIVE';
  }

  // Check destructive
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(combined)) return 'DESTRUCTIVE';
  }

  // Check mutating
  for (const pattern of MUTATING_PATTERNS) {
    if (pattern.test(combined)) return 'MUTATING';
  }

  // Check safe
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(combined)) return 'SAFE';
  }

  // Links are generally safe for navigation
  if (tag === 'a' && href && !href.startsWith('javascript:')) {
    return 'SAFE';
  }

  // Navigation-like elements
  if (['tab', 'menuitem', 'option'].includes(type ?? '')) {
    return 'LIKELY_SAFE';
  }

  // Inputs for data entry
  if (['input', 'select', 'textarea'].includes(tag)) {
    return 'LIKELY_SAFE';
  }

  // Summary/details toggling
  if (tag === 'summary') {
    return 'SAFE';
  }

  return 'UNKNOWN';
}

/**
 * Determine if an action should be executed based on its risk and policy.
 */
export function shouldExecuteAction(
  risk: ActionRisk,
  policy: { mutating: string; destructive: string; unknown: string }
): boolean {
  switch (risk) {
    case 'SAFE':
    case 'LIKELY_SAFE':
      return true;
    case 'MUTATING':
      return policy.mutating === 'execute';
    case 'DESTRUCTIVE':
      return policy.destructive === 'execute';
    case 'UNKNOWN':
      return policy.unknown === 'execute';
  }
}
