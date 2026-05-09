import katex from 'katex';

export type TexValidationWarning = {
  row: number;
  field: string;
  message: string;
};

const MATH_SEGMENT_PATTERN = /(?<!\\)\$([^$]+)(?<!\\)\$/g;

export function extractTexSegments(value: string): string[] {
  return [...value.matchAll(MATH_SEGMENT_PATTERN)].map((match) => match[1]);
}

export function validateTexValue(value: string, row: number, field: string): TexValidationWarning[] {
  const warnings: TexValidationWarning[] = [];

  for (const segment of extractTexSegments(value)) {
    // eslint-disable-next-line no-console
    const originalWarn = console.warn;
    try {
      // eslint-disable-next-line no-console
      console.warn = () => undefined;
      katex.renderToString(segment, {
        displayMode: false,
        throwOnError: true,
        strict: false,
      });
    } catch (error) {
      warnings.push({
        row,
        field,
        message: error instanceof Error ? error.message : 'Invalid TeX',
      });
    } finally {
      // eslint-disable-next-line no-console
      console.warn = originalWarn;
    }
  }

  return warnings;
}
