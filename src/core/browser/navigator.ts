import type { Page } from 'playwright';
import type { UIState, Action } from '../states/types.js';

/**
 * Execute a single action on a page with safety timeout.
 */
export async function executePageAction(page: Page, action: Action, timeout: number = 5000): Promise<void> {
  try {
    switch (action.type) {
      case 'navigate': {
        const locator = page.locator(action.selector).first();
        const href = await locator.getAttribute('href').catch(() => null);
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try {
            await page.goto(
              new URL(href, page.url()).toString(),
              { waitUntil: 'domcontentloaded', timeout: 10000 }
            );
          } catch {
            await locator.click({ timeout }).catch(() => {});
          }
        } else {
          await locator.click({ timeout }).catch(() => {});
        }
        break;
      }
      case 'click':
        await page.locator(action.selector).first().click({ timeout }).catch(() => {});
        break;
      case 'fill':
        if (action.value !== undefined) {
          await page.locator(action.selector).first().fill(action.value, { timeout }).catch(() => {});
        }
        break;
      case 'submit':
        await page.locator(action.selector).first().click({ timeout }).catch(() => {});
        break;
      default:
        await page.locator(action.selector).first().click({ timeout }).catch(() => {});
    }
  } catch {
    // Best effort
  }
}

/**
 * Accurately navigate to and reconstruct any UI state (including dynamic modals and form states).
 */
export async function navigateToState(page: Page, state: UIState): Promise<boolean> {
  try {
    // 1. Navigate to base state URL
    await page.goto(state.url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    }).catch(() => {});

    try {
      const urlObj = new URL(state.url);
      if (urlObj.hash) {
        await page.evaluate((h) => {
          window.location.hash = h;
          window.dispatchEvent(new Event('hashchange'));
        }, urlObj.hash.slice(1)).catch(() => {});
      }
    } catch {
      // Invalid URL or relative hash
    }

    await page.waitForTimeout(200);

    // 2. Replay actions to reconstruct dynamic state if any
    if (state.actionsToReach && state.actionsToReach.length > 0) {
      for (const act of state.actionsToReach) {
        await executePageAction(page, act);
        await page.waitForTimeout(200);
      }
    }

    return true;
  } catch {
    return false;
  }
}
