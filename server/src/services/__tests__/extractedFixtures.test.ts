import fs from 'fs';
import path from 'path';
import { validateTexValue } from '../texValidation';

const fixtureDir = '/Users/kshitijghode/code/scraper/data/extracted';

type ExtractedFixtureRow = {
  question_number: number;
  text: string;
  options: string[] | null;
  explanation: string;
};

function readFixtureRows() {
  return fs.readdirSync(fixtureDir)
    .filter((file) => file.endsWith('.jsonl'))
    .flatMap((file) => {
      const content = fs.readFileSync(path.join(fixtureDir, file), 'utf-8');
      return content.split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ file, row: JSON.parse(line) as ExtractedFixtureRow }));
    });
}

describe('extracted JSONL fixtures', () => {
  it('contains TeX segments that KaTeX can validate', () => {
    const failures = readFixtureRows().flatMap(({ file, row }) => {
      const warnings = [
        ...validateTexValue(row.text, row.question_number, 'text'),
        ...(row.options ?? []).flatMap((option, index) => (
          validateTexValue(option, row.question_number, `options.${index}`)
        )),
        ...validateTexValue(row.explanation, row.question_number, 'explanation'),
      ];

      return warnings.map((warning) => (
        `${file}:Q${warning.row}:${warning.field}: ${warning.message}`
      ));
    });

    expect(failures).toEqual([]);
  });

  it('includes representative raw TeX cases used by the renderer', () => {
    const rows = readFixtureRows();
    const values = rows.flatMap(({ row }) => [
      row.text,
      ...(row.options ?? []),
      row.explanation,
    ]);
    const corpus = values.join('\n');

    expect(corpus).toContain('5^{x-1}');
    expect(corpus).toContain('3^{y+1}');
    expect(corpus).toContain('\\log_e');
    expect(corpus).toContain('(4096)^{7+4\\sqrt{3}}');
    expect(corpus).toContain('\\frac');
    expect(corpus).toContain('\\sqrt');
    expect(corpus).toContain('^\\circ');
  });
});
