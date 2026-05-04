import { normalizeExtractedMathText } from '../mathTextNormalizer';

describe('normalizeExtractedMathText', () => {
  it('normalizes degree and square-root markup in the chord question', () => {
    const question = 'A chord of length 5 cm subtends an angle of $60^\\circ$ at the centre. Another angle is $120^\\circ$.';
    const option = '$5\\sqrt{3}$';

    expect(normalizeExtractedMathText(question)).toContain('60°');
    expect(normalizeExtractedMathText(question)).toContain('120°');
    expect(normalizeExtractedMathText(option)).toBe('5√3');
  });

  it('normalizes exponents and log bases in the logarithm question', () => {
    const question = 'The real root of the equation $2^{6x} + 2^{3x+2} - 21 = 0$ is';
    const option = '$\\frac{\\log_2 3}{3}$';

    expect(normalizeExtractedMathText(question)).toContain('2⁶ˣ');
    expect(normalizeExtractedMathText(question)).toContain('2³ˣ⁺²');
    expect(normalizeExtractedMathText('$\\log_2 9$')).toBe('log₂ 9');
    expect(normalizeExtractedMathText(option)).toBe('log₂ 3/3');
  });

  it('normalizes natural log bases', () => {
    expect(normalizeExtractedMathText('$\\log_e x$')).toBe('logₑ x');
    expect(normalizeExtractedMathText('$\\log_{e} (25)$')).toBe('logₑ (25)');
  });
});
