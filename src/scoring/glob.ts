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

    if (char === '*' && pattern.charAt(i + 1) === '*') {
      const afterIndex = i + 2;
      const atStart = i === 0;
      const atEnd = afterIndex === pattern.length;
      const precededBySlash = atStart || pattern.charAt(i - 1) === '/';
      const followedBySlash = !atEnd && pattern.charAt(afterIndex) === '/';

      if (atStart && atEnd) {
        // The whole pattern is just "**": match anything.
        result += '.*';
        i = afterIndex;
        continue;
      }

      if (precededBySlash && followedBySlash) {
        // "**/" at the start, or "/**/" in the middle: zero or more whole
        // path segments, so the match stays anchored to a "/" boundary.
        result = atStart ? `${result}(?:.*/)?` : `${result.slice(0, -1)}(?:/.*)?/`;
        i = afterIndex + 1;
        continue;
      }

      if (precededBySlash && atEnd) {
        // Trailing "/**": zero or more whole path segments after this point.
        result = `${result.slice(0, -1)}(?:/.*)?`;
        i = afterIndex;
        continue;
      }

      // "**" without a clean "/" boundary on at least one side: fall back to
      // the lenient, unanchored behavior.
      result += '.*';
      i = afterIndex;
      continue;
    }

    if (char === '*') {
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
