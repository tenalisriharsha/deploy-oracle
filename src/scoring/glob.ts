const REGEXP_SPECIAL_CHARS = '.+^${}()|[]\\';

/**
 * Converts a small subset of glob syntax (`*` and `**`) into a RegExp.
 * `**` matches across path separators; a single `*` stays within one segment.
 * Not a full glob implementation — just enough for critical-path matching.
 */
export function globToRegExp(pattern: string): RegExp {
  let result = '';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern.charAt(i);

    if (char === '*') {
      if (pattern.charAt(i + 1) === '*') {
        result += '.*';
        i += 2;
        if (pattern.charAt(i) === '/') i += 1;
        continue;
      }
      result += '[^/]*';
      i += 1;
      continue;
    }

    result += REGEXP_SPECIAL_CHARS.includes(char) ? `\\${char}` : char;
    i += 1;
  }

  return new RegExp(`^${result}$`, 'i');
}

/**
 * Returns the first pattern that matches `path`, or undefined if none do.
 */
export function matchesAnyGlob(path: string, patterns: string[]): string | undefined {
  return patterns.find((pattern) => globToRegExp(pattern).test(path));
}
