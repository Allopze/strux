/**
 * Sanitize sensitive data before sending to AI providers.
 */
export function sanitizeForAI(text: string, _redactSelectors: string[] = []): string {
  let result = text;

  // Redact common sensitive patterns
  // JWT tokens
  result = result.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');

  // API keys (common formats)
  result = result.replace(/(?:api[_-]?key|apikey|api_secret|access_token|secret_key|x-api-key)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi, '[REDACTED_API_KEY]');

  // Bearer tokens
  result = result.replace(/Bearer\s+[A-Za-z0-9_\-.]+/g, 'Bearer [REDACTED]');

  // Passwords in various formats
  result = result.replace(/(?:password|passwd|pwd|secret)\s*[:=]\s*['"]?[^\s'"]+['"]?/gi, '[REDACTED_PASSWORD]');

  // Authorization headers
  result = result.replace(/Authorization:\s*.+/gi, 'Authorization: [REDACTED]');

  // Cookie values
  result = result.replace(/(?:cookie|set-cookie):\s*.+/gi, '[REDACTED_COOKIE]');

  // Credit Card Numbers (13-19 digits, optionally spaced or hyphenated)
  result = result.replace(/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12}|(?:[0-9]{4}[-\s]){3}[0-9]{4})\b/g, '[REDACTED_CREDIT_CARD]');

  // Social Security Numbers (SSN)
  result = result.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');

  // Email addresses (partial redaction)
  result = result.replace(/([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[email]@$2');

  return result;
}

/**
 * Sanitize a DOM snippet by removing sensitive content.
 */
export function sanitizeDomSnippet(
  html: string,
  redactInputs: boolean = false,
  redactSelectors: string[] = []
): string {
  let result = html;

  if (redactInputs) {
    // Redact input values
    result = result.replace(/value="[^"]*"/g, 'value="[REDACTED]"');
    result = result.replace(/value='[^']*'/g, "value='[REDACTED]'");
  }

  // Redact specific selectors if specified
  for (const selector of redactSelectors) {
    if (!selector) continue;
    const cleanSelector = selector.replace(/^[.#]/, '');
    const regex = new RegExp(`(<[^>]*(?:id|class|data-testid)=["'][^"']*${cleanSelector}[^"']*["'][^>]*>)[\\s\\S]*?(<\\/[^>]+>)`, 'gi');
    result = result.replace(regex, '$1[REDACTED]$2');
  }

  // Remove script content
  result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '<script>[REDACTED]</script>');

  return result;
}
