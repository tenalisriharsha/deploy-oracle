import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesAnyGlob } from './glob.js';

describe('globToRegExp', () => {
  it('matches a literal path exactly', () => {
    expect(globToRegExp('src/index.ts').test('src/index.ts')).toBe(true);
    expect(globToRegExp('src/index.ts').test('src/other.ts')).toBe(false);
  });

  it('matches a single segment with *', () => {
    const re = globToRegExp('src/*.ts');
    expect(re.test('src/index.ts')).toBe(true);
    expect(re.test('src/nested/index.ts')).toBe(false);
  });

  it('matches across segments with **', () => {
    const re = globToRegExp('**/auth/**');
    expect(re.test('src/services/auth/login.ts')).toBe(true);
    expect(re.test('auth/login.ts')).toBe(true);
    expect(re.test('src/services/payments/checkout.ts')).toBe(false);
  });

  it('matches substrings with **/*keyword*', () => {
    const re = globToRegExp('**/*payment*');
    expect(re.test('src/services/payment-service.ts')).toBe(true);
    expect(re.test('src/services/checkout.ts')).toBe(false);
  });

  it('escapes regex special characters in the pattern', () => {
    const re = globToRegExp('src/foo.bar.ts');
    expect(re.test('src/foo.bar.ts')).toBe(true);
    expect(re.test('src/fooXbarYts')).toBe(false);
  });
});

describe('matchesAnyGlob', () => {
  it('returns the first matching pattern', () => {
    expect(matchesAnyGlob('src/services/auth-service.ts', ['**/*payment*', '**/*auth*'])).toBe(
      '**/*auth*',
    );
  });

  it('returns undefined when nothing matches', () => {
    expect(matchesAnyGlob('src/index.ts', ['**/*payment*', '**/*auth*'])).toBeUndefined();
  });
});
