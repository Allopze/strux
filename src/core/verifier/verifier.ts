import type { Page } from 'playwright';
import type { Finding } from '../findings/types.js';
import type { VerificationStatus } from '../findings/types.js';
import { executePageAction } from '../browser/navigator.js';
import { Logger } from '../logger.js';

const log = new Logger({ prefix: 'Verifier' });

export interface VerificationResult {
  findingId: string;
  status: VerificationStatus;
  notes: string;
}

/**
 * Attempts to reproduce and verify findings by replaying their
 * reproduction steps and checking the resulting state.
 */
export class FindingVerifier {
  private page: Page;

  constructor(page: Page, _targetUrl: string) {
    this.page = page;
  }

  async verifyAll(findings: Finding[]): Promise<Finding[]> {
    const verifiable = findings.filter(
      (f) => f.verificationStatus === 'UNVERIFIED' &&
             (f.severity === 'CRITICAL' || f.severity === 'HIGH' || f.severity === 'MEDIUM')
    );

    log.info(`Verifying ${verifiable.length}/${findings.length} findings...`);

    let verified = 0;
    let rejected = 0;

    for (const finding of verifiable) {
      try {
        const result = await this.verify(finding);
        finding.verificationStatus = result.status;
        log.debug(`Verification for ${finding.id} [${finding.ruleId ?? finding.category}]: ${result.status} (${result.notes})`);
        if (result.status === 'VERIFIED') verified++;
        if (result.status === 'REJECTED') rejected++;
      } catch (err) {
        finding.verificationStatus = 'UNABLE_TO_VERIFY';
        log.debug(`Could not verify ${finding.id}: ${err}`);
      }
    }

    log.info(`Verification complete: ${verified} verified, ${rejected} rejected`);
    return findings;
  }

  private async verify(finding: Finding): Promise<VerificationResult> {
    // Navigate to the finding's URL
    if (finding.url) {
      try {
        if (finding.viewport) {
          await this.page.setViewportSize({
            width: finding.viewport.width,
            height: finding.viewport.height,
          }).catch(() => {});
        }

        await this.page.goto(finding.url, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        const urlObj = new URL(finding.url);
        if (urlObj.hash) {
          await this.page.evaluate((h) => {
            window.location.hash = h;
            window.dispatchEvent(new Event('hashchange'));
          }, urlObj.hash.slice(1)).catch(() => {});
        }
        await this.page.waitForTimeout(300);
      } catch (err) {
        log.warn(`Verify navigation error on ${finding.id} (${finding.url}): ${err}`);
        return {
          findingId: finding.id,
          status: 'UNABLE_TO_VERIFY',
          notes: `Could not navigate to the finding URL: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // Replay reproduction steps to reach exact state
    for (const step of finding.reproductionSteps) {
      await executePageAction(this.page, step);
      await this.page.waitForTimeout(200);
    }

    // Direct verification for axe-core rules with evidence
    if (finding.ruleId?.startsWith('a11y-') && finding.evidence.some((e) => e.type === 'axe-violation')) {
      return {
        findingId: finding.id,
        status: 'VERIFIED',
        notes: `WCAG rule violation verified with axe-core evidence (${finding.ruleId})`,
      };
    }

    // Specific verification by rule ID
    if (finding.ruleId?.includes('touch-target') && finding.selector) {
      return this.verifyTouchTarget(finding);
    }

    if (finding.ruleId?.includes('overflow') && finding.selector) {
      return this.verifyOverflow(finding);
    }

    if (finding.ruleId === 'a11y-heading-order') {
      return this.verifyHeadingOrder(finding);
    }

    if (finding.ruleId === 'a11y-missing-main' || finding.ruleId === 'a11y-missing-h1') {
      return this.verifyLandmarksAndH1(finding);
    }

    if (finding.ruleId === 'forms-missing-label' && finding.selector) {
      return this.verifyFormLabel(finding);
    }

    if (finding.ruleId === 'nav-dead-link' && finding.selector) {
      return this.verifyDeadLink(finding);
    }

    if (finding.ruleId?.startsWith('sys-console')) {
      return {
        findingId: finding.id,
        status: 'VERIFIED',
        notes: 'Console error/warning was captured during runtime exploration',
      };
    }

    if (finding.ruleId === 'resp-horizontal-overflow') {
      const hasOverflow = await this.page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
      }).catch(() => false);
      return {
        findingId: finding.id,
        status: hasOverflow ? 'VERIFIED' : 'REJECTED',
        notes: hasOverflow ? 'Horizontal overflow confirmed' : 'No horizontal overflow detected',
      };
    }

    if (finding.selector) {
      return this.verifySelector(finding);
    }

    if (finding.evidence.length > 0 && finding.source === 'rule') {
      return {
        findingId: finding.id,
        status: 'VERIFIED',
        notes: 'Rule-based finding verified with collected evidence',
      };
    }

    return {
      findingId: finding.id,
      status: 'PARTIAL',
      notes: 'Reproduced navigation path; issue condition remains unconfirmed',
    };
  }

  private async verifyTouchTarget(finding: Finding): Promise<VerificationResult> {
    try {
      const locator = this.page.locator(finding.selector!).first();
      const isVisible = await locator.isVisible({ timeout: 3000 }).catch(() => false);
      if (!isVisible) {
        return { findingId: finding.id, status: 'REJECTED', notes: 'Element not visible' };
      }
      const bbox = await locator.boundingBox();
      if (bbox && (bbox.width < 44 || bbox.height < 44)) {
        return {
          findingId: finding.id,
          status: 'VERIFIED',
          notes: `Touch target confirmed too small: ${Math.round(bbox.width)}×${Math.round(bbox.height)}px`,
        };
      }
      return { findingId: finding.id, status: 'REJECTED', notes: 'Target size now meets criteria' };
    } catch {
      return { findingId: finding.id, status: 'UNABLE_TO_VERIFY', notes: 'Could not inspect element' };
    }
  }

  private async verifyOverflow(finding: Finding): Promise<VerificationResult> {
    try {
      const locator = this.page.locator(finding.selector!).first();
      const bbox = await locator.boundingBox();
      const vp = this.page.viewportSize() ?? { width: 1440, height: 900 };
      if (bbox && (bbox.x + bbox.width > vp.width || bbox.x < 0)) {
        return {
          findingId: finding.id,
          status: 'VERIFIED',
          notes: `Overflow confirmed: element bounds outside viewport`,
        };
      }
      return { findingId: finding.id, status: 'REJECTED', notes: 'Element fits within viewport' };
    } catch {
      return { findingId: finding.id, status: 'UNABLE_TO_VERIFY', notes: 'Could not verify overflow' };
    }
  }

  private async verifyHeadingOrder(finding: Finding): Promise<VerificationResult> {
    try {
      const headings = await this.page.evaluate(() => {
        const list: number[] = [];
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            list.push(parseInt(el.tagName[1]!, 10));
          }
        });
        return list;
      });

      let skipped = false;
      let prev = 0;
      for (const lvl of headings) {
        if (lvl > prev + 1 && prev > 0) skipped = true;
        prev = lvl;
      }

      if (skipped) {
        return { findingId: finding.id, status: 'VERIFIED', notes: 'Heading level skip confirmed in reproduced DOM' };
      }
      return { findingId: finding.id, status: 'REJECTED', notes: 'No heading skip found' };
    } catch {
      return { findingId: finding.id, status: 'UNABLE_TO_VERIFY', notes: 'Could not evaluate headings' };
    }
  }

  private async verifyLandmarksAndH1(finding: Finding): Promise<VerificationResult> {
    try {
      if (finding.ruleId === 'a11y-missing-main') {
        const hasMain = await this.page.evaluate(() => {
          return document.querySelector('main, [role="main"]') !== null;
        });
        return {
          findingId: finding.id,
          status: !hasMain ? 'VERIFIED' : 'REJECTED',
          notes: !hasMain ? 'Confirmed: No main landmark exists on page' : 'Main landmark found',
        };
      }

      if (finding.ruleId === 'a11y-missing-h1') {
        const hasH1 = await this.page.evaluate(() => {
          return document.querySelector('h1') !== null;
        });
        return {
          findingId: finding.id,
          status: !hasH1 ? 'VERIFIED' : 'REJECTED',
          notes: !hasH1 ? 'Confirmed: No h1 heading exists on page' : 'h1 heading found',
        };
      }

      return { findingId: finding.id, status: 'PARTIAL', notes: 'Landmark check' };
    } catch {
      return { findingId: finding.id, status: 'UNABLE_TO_VERIFY', notes: 'Could not evaluate landmarks' };
    }
  }

  private async verifyFormLabel(finding: Finding): Promise<VerificationResult> {
    try {
      const locator = this.page.locator(finding.selector!).first();
      const hasAccessibleName = await locator.evaluate((el) => {
        const htmlEl = el as HTMLElement;
        const ariaLabel = htmlEl.getAttribute('aria-label');
        const ariaLabelledby = htmlEl.getAttribute('aria-labelledby');
        const id = htmlEl.id;
        const labelFor = id ? document.querySelector(`label[for="${id}"]`) : null;
        return Boolean(ariaLabel || ariaLabelledby || labelFor);
      });

      return {
        findingId: finding.id,
        status: !hasAccessibleName ? 'VERIFIED' : 'REJECTED',
        notes: !hasAccessibleName ? 'Confirmed: Input lacks accessible label' : 'Input has associated label',
      };
    } catch {
      return { findingId: finding.id, status: 'UNABLE_TO_VERIFY', notes: 'Could not evaluate input' };
    }
  }

  private async verifyDeadLink(finding: Finding): Promise<VerificationResult> {
    try {
      const locator = this.page.locator(finding.selector!).first();
      const href = await locator.getAttribute('href');
      const isDead = !href || href === '#' || href.startsWith('javascript:');
      return {
        findingId: finding.id,
        status: isDead ? 'VERIFIED' : 'REJECTED',
        notes: isDead ? `Confirmed: Link href="${href ?? ''}" is non-functional` : 'Link has valid href',
      };
    } catch {
      return { findingId: finding.id, status: 'UNABLE_TO_VERIFY', notes: 'Could not inspect link' };
    }
  }

  private async verifySelector(finding: Finding): Promise<VerificationResult> {
    try {
      const locator = this.page.locator(finding.selector!).first();
      const isVisible = await locator.isVisible({ timeout: 3000 }).catch(() => false);

      if (!isVisible) {
        return {
          findingId: finding.id,
          status: 'UNABLE_TO_VERIFY',
          notes: 'Selector exists but element is not visible in current reproduced state',
        };
      }

      return {
        findingId: finding.id,
        status: 'PARTIAL',
        notes: 'Target element located and visible in reproduced state; defect condition requires manual confirmation',
      };
    } catch {
      return {
        findingId: finding.id,
        status: 'UNABLE_TO_VERIFY',
        notes: 'Could not locate element',
      };
    }
  }
}
