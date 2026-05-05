import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function main() {
  const { prisma } = await import('../src/models/prisma');
  try {
    const { resetExtractedQuestions } = await import('../src/services/extractedQuestionReset');
    const result = await resetExtractedQuestions();
    console.log(
      `Deleted ${result.questionsDeleted} extracted questions, `
      + `${result.practiceAnswersDeleted} practice answers, `
      + `and ${result.matchAnswersDeleted} match answers`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
