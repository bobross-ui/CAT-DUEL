import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../models/prisma';

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

export interface GenerateParams {
  category: 'QUANT' | 'DILR' | 'VARC';
  difficulty: number;
  subTopic?: string;
  count: number;
}

const aiOutputSchema = z.object({
  text: z.string().min(10),
  options: z.array(z.string().min(1)).length(4),
  correctAnswer: z.number().int().min(0).max(3),
  explanation: z.string().min(10),
  subTopic: z.string().optional(),
});

function buildPrompt(category: string, difficulty: number, subTopic?: string): string {
  return `You are a CAT (Common Admission Test) exam question creator.
Generate a multiple-choice question for the ${category} section.
${subTopic ? `Sub-topic: ${subTopic}` : ''}
Difficulty: ${difficulty}/5 (1 = basic concept, 3 = standard CAT level, 5 = extremely hard)

Requirements:
- The question must be original and test conceptual understanding
- Exactly 4 options, only one correct
- Options must include plausible distractors that represent common mistakes
- Explanation must show the complete solution step-by-step
- For QUANT: include numerical working
- For DILR: provide a clear logical chain
- For VARC: reference specific parts of the text or argument

Respond ONLY with this JSON (no markdown, no backticks, no extra text):
{
  "text": "question text here",
  "options": ["option1", "option2", "option3", "option4"],
  "correctAnswer": 0,
  "explanation": "step-by-step solution",
  "subTopic": "specific topic tested"
}`;
}

export async function generateQuestions(params: GenerateParams) {
  const results: { saved: number; failed: number; questions: object[] } = {
    saved: 0,
    failed: 0,
    questions: [],
  };

  for (let i = 0; i < params.count; i++) {
    let rawText = '';
    try {
      const result = await model.generateContent(
        buildPrompt(params.category, params.difficulty, params.subTopic)
      );
      rawText = result.response.text().trim();

      // Gemini often wraps output in ```json ... ``` despite instructions
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

      const parsed = JSON.parse(jsonText);
      const validated = aiOutputSchema.safeParse(parsed);

      if (!validated.success) {
        console.error(`[questionGenerator] Validation failed (item ${i + 1}):`, validated.error.issues[0].message);
        results.failed++;
        continue;
      }

      const question = await prisma.question.create({
        data: {
          category: params.category,
          questionType: 'MCQ',
          difficulty: params.difficulty,
          subTopic: validated.data.subTopic ?? params.subTopic ?? null,
          text: validated.data.text,
          options: validated.data.options,
          correctAnswer: validated.data.correctAnswer,
          correctAnswerText: null,
          explanation: validated.data.explanation,
          source: 'AI',
          isVerified: false,
        },
      });

      results.saved++;
      results.questions.push(question);
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.error(`[questionGenerator] JSON parse failed (item ${i + 1}). Raw:`, rawText.slice(0, 500));
      } else {
        console.error(`[questionGenerator] API error (item ${i + 1}):`, err);
      }
      results.failed++;
    }
  }

  return results;
}
