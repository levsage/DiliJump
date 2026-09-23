import { describe, it, expect } from 'vitest';
import { sanitizeName, escapeHtml, formatNumber } from '../src/utils/format.js';

describe('sanitizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeName('   Dili    Hero  ')).toBe('Dili Hero');
  });
  it('strips markup and control characters', () => {
    expect(sanitizeName('<b>Bob</b>\u0007')).toBe('bBob/b');
  });
  it('enforces max length', () => {
    expect(sanitizeName('a'.repeat(40), 16)).toHaveLength(16);
  });
  it('handles nullish input', () => {
    expect(sanitizeName(undefined)).toBe('');
  });
  it('keeps unicode names (e.g. Bangla)', () => {
    expect(sanitizeName('রাহিম')).toBe('রাহিম');
  });
});

describe('escapeHtml', () => {
  it('escapes special characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('formatNumber', () => {
  it('floors and groups digits', () => {
    expect(formatNumber(1234567.9)).toBe('1,234,567');
  });
});
