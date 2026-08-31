import { describe, it, expect } from 'vitest';
import { sanitizeForAI } from '../../src/core/sanitizer/sanitizer.js';

describe('sanitizeForAI', () => {
  it('redacts JWT tokens', () => {
    const input = 'Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_here';
    const result = sanitizeForAI(input);
    expect(result).toContain('[REDACTED_JWT]');
    expect(result).not.toContain('eyJ');
  });

  it('redacts Bearer tokens', () => {
    const input = 'Header: Bearer abc123def456';
    const result = sanitizeForAI(input);
    expect(result).toContain('Bearer [REDACTED]');
  });

  it('redacts passwords', () => {
    const input = 'password: my_secret_pass';
    const result = sanitizeForAI(input);
    expect(result).toContain('[REDACTED_PASSWORD]');
    expect(result).not.toContain('my_secret_pass');
  });

  it('redacts API keys', () => {
    const input = 'api_key: sk_live_abcdef123456789012345';
    const result = sanitizeForAI(input);
    expect(result).toContain('[REDACTED_API_KEY]');
  });

  it('redacts credit card numbers', () => {
    const input = 'Credit card: 4532-1234-5678-9010 on invoice';
    const result = sanitizeForAI(input);
    expect(result).toContain('[REDACTED_CREDIT_CARD]');
    expect(result).not.toContain('4532-1234-5678-9010');
  });

  it('redacts SSNs', () => {
    const input = 'SSN: 123-45-6789 in profile';
    const result = sanitizeForAI(input);
    expect(result).toContain('[REDACTED_SSN]');
    expect(result).not.toContain('123-45-6789');
  });

  it('keeps normal text unchanged', () => {
    const input = 'This is a normal paragraph about vehicles.';
    expect(sanitizeForAI(input)).toBe(input);
  });
});
