const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  x: 'ˣ',
};

const SUBSCRIPT: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
};

function mapScript(value: string, script: Record<string, string>): string | null {
  let output = '';
  for (const char of value.replace(/\s+/g, '')) {
    const mapped = script[char];
    if (!mapped) return null;
    output += mapped;
  }
  return output;
}

function isSimpleRadicand(value: string): boolean {
  return /^[A-Za-z0-9]+$/.test(value);
}

function normalizeInlineMath(value: string): string {
  return value
    .replace(/\\left|\\right/g, '')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, (_, radicand: string) => {
      const normalized = normalizeInlineMath(radicand);
      return isSimpleRadicand(normalized) ? `√${normalized}` : `√(${normalized})`;
    })
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, (_, numerator: string, denominator: string) => (
      `${normalizeInlineMath(numerator)}/${normalizeInlineMath(denominator)}`
    ))
    .replace(/(\d+)\s*\^\s*(?:\{\\circ\}|\\circ)/g, '$1°')
    .replace(/\\log_\{([^{}]+)\}/g, (_, base: string) => {
      const subscript = mapScript(normalizeInlineMath(base), SUBSCRIPT);
      return subscript ? `log${subscript}` : `log_${normalizeInlineMath(base)}`;
    })
    .replace(/\\log_([A-Za-z0-9]+)/g, (_, base: string) => {
      const subscript = mapScript(base, SUBSCRIPT);
      return subscript ? `log${subscript}` : `log_${base}`;
    })
    .replace(/\^\s*\{([^{}]+)\}/g, (_, exponent: string) => {
      const normalized = normalizeInlineMath(exponent);
      const superscript = mapScript(normalized, SUPERSCRIPT);
      return superscript ?? `^(${normalized})`;
    })
    .replace(/\^\s*([A-Za-z0-9+\-=()]+)/g, (_, exponent: string) => {
      const superscript = mapScript(exponent, SUPERSCRIPT);
      return superscript ?? `^(${exponent})`;
    })
    .replace(/_\{([^{}]+)\}/g, (_, subscriptValue: string) => {
      const normalized = normalizeInlineMath(subscriptValue);
      const subscript = mapScript(normalized, SUBSCRIPT);
      return subscript ?? `_${normalized}`;
    })
    .replace(/_([A-Za-z0-9]+)/g, (_, subscriptValue: string) => {
      const subscript = mapScript(subscriptValue, SUBSCRIPT);
      return subscript ?? `_${subscriptValue}`;
    })
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq?|≤/g, '≤')
    .replace(/\\geq?|≥/g, '≥')
    .replace(/\\neq|\\ne/g, '≠')
    .replace(/\\equiv/g, '≡')
    .replace(/\\Rightarrow|\\implies/g, '⇒')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\infty/g, '∞')
    .replace(/\\angle/g, '∠')
    .replace(/\\triangle/g, '△')
    .replace(/\\parallel/g, '∥')
    .replace(/\\pi/g, 'π')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\,/g, ' ')
    .replace(/\\/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeExtractedMathText(value: string): string {
  return normalizeInlineMath(value.replace(/\$/g, ''))
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
