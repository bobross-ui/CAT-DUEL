import { prisma } from '../models/prisma';

export type ExtractedQuestionResetResult = {
  questionsDeleted: number;
  practiceAnswersDeleted: number;
  matchAnswersDeleted: number;
};

export async function resetExtractedQuestions(): Promise<ExtractedQuestionResetResult> {
  const questions = await prisma.question.findMany({
    where: { source: 'EXTRACTED' },
    select: { id: true },
  });

  const questionIds = questions.map((question) => question.id);
  if (questionIds.length === 0) {
    return { questionsDeleted: 0, practiceAnswersDeleted: 0, matchAnswersDeleted: 0 };
  }

  return prisma.$transaction(async (tx) => {
    const practiceAnswers = await tx.practiceAnswer.deleteMany({
      where: { questionId: { in: questionIds } },
    });
    const matchAnswers = await tx.matchAnswer.deleteMany({
      where: { questionId: { in: questionIds } },
    });
    const deletedQuestions = await tx.question.deleteMany({
      where: { id: { in: questionIds } },
    });

    return {
      questionsDeleted: deletedQuestions.count,
      practiceAnswersDeleted: practiceAnswers.count,
      matchAnswersDeleted: matchAnswers.count,
    };
  });
}
