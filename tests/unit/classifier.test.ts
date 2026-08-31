import { describe, it, expect } from 'vitest';
import { classifyRisk } from '../../src/core/interactions/detector.js';

describe('classifyRisk', () => {
  it('classifies delete actions as DESTRUCTIVE', () => {
    expect(classifyRisk('Delete item', 'button')).toBe('DESTRUCTIVE');
    expect(classifyRisk('Eliminar vehículo', 'button')).toBe('DESTRUCTIVE');
    expect(classifyRisk('Borrar registro', 'button')).toBe('DESTRUCTIVE');
  });

  it('classifies logout as DESTRUCTIVE', () => {
    expect(classifyRisk('Cerrar sesión', 'button')).toBe('DESTRUCTIVE');
    expect(classifyRisk('Sign out', 'a')).toBe('DESTRUCTIVE');
    expect(classifyRisk('Logout', 'button')).toBe('DESTRUCTIVE');
  });

  it('classifies payment actions as MUTATING', () => {
    expect(classifyRisk('Pagar factura', 'button')).toBe('MUTATING');
    expect(classifyRisk('Comprar producto', 'button')).toBe('MUTATING');
    expect(classifyRisk('Submit form', 'button')).toBe('MUTATING');
  });

  it('classifies safe navigation as SAFE', () => {
    expect(classifyRisk('View details', 'a', undefined, '/items/1')).toBe('SAFE');
    expect(classifyRisk('Buscar', 'button')).toBe('SAFE');
    expect(classifyRisk('Filter', 'button')).toBe('SAFE');
  });

  it('classifies links with href as SAFE', () => {
    expect(classifyRisk('Some link', 'a', undefined, '/page')).toBe('SAFE');
  });

  it('classifies inputs as LIKELY_SAFE', () => {
    expect(classifyRisk('', 'input')).toBe('LIKELY_SAFE');
    expect(classifyRisk('', 'select')).toBe('LIKELY_SAFE');
    expect(classifyRisk('', 'textarea')).toBe('LIKELY_SAFE');
  });

  it('classifies unknown buttons as UNKNOWN', () => {
    expect(classifyRisk('XYZ', 'button')).toBe('UNKNOWN');
  });
});
