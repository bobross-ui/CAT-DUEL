import { gradeAnswer, normalizeTypedAnswer } from '../answerGrading';

describe('gradeAnswer', () => {
  it('grades MCQ answers by selected option index', () => {
    const question = { questionType: 'MCQ' as const, correctAnswer: 2, correctAnswerText: null };

    expect(gradeAnswer(question, { selectedAnswer: 2 })).toBe(true);
    expect(gradeAnswer(question, { selectedAnswer: 1 })).toBe(false);
    expect(gradeAnswer(question, { typedAnswer: '2' })).toBe(false);
  });

  it('grades TITA answers by normalized exact match', () => {
    const question = { questionType: 'TITA' as const, correctAnswer: null, correctAnswerText: '6' };

    expect(gradeAnswer(question, { typedAnswer: '6' })).toBe(true);
    expect(gradeAnswer(question, { typedAnswer: ' 6 ' })).toBe(true);
    expect(gradeAnswer(question, { typedAnswer: '6.0' })).toBe(true);
    expect(gradeAnswer(question, { typedAnswer: '7' })).toBe(false);
    expect(gradeAnswer(question, { selectedAnswer: 0 })).toBe(false);
  });
});

describe('normalizeTypedAnswer', () => {
  it('trims, collapses whitespace, and normalizes simple numeric strings', () => {
    expect(normalizeTypedAnswer('  6.0  ')).toBe('6');
    expect(normalizeTypedAnswer('31.50')).toBe('31.5');
    expect(normalizeTypedAnswer('two   words')).toBe('two words');
  });
});
