import { describe, expect, it } from 'vitest';
import { normaliseQieName } from './qie-name';

describe('normaliseQieName', () => {
  it('keeps full names and adds the suffix to bare ones', () => {
    expect(normaliseQieName('molivo.qie')).toBe('molivo.qie');
    expect(normaliseQieName('Tuft')).toBe('tuft.qie');
  });

  it('rejects empty, oversized or markup-like values', () => {
    expect(normaliseQieName('')).toBeNull();
    expect(normaliseQieName('   ')).toBeNull();
    expect(normaliseQieName('a'.repeat(65))).toBeNull();
    expect(normaliseQieName('<script>x</script>')).toBeNull();
    expect(normaliseQieName('bad name')).toBeNull();
    expect(normaliseQieName('nul\u0000.qie')).toBeNull();
  });
});
