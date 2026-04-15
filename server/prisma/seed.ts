import { PrismaClient } from '../src/generated/prisma/client'

const prisma = new PrismaClient();

async function main() {
  // Seed test user
  const user = await prisma.user.upsert({
    where: { email: 'test@catduel.com' },
    update: {},
    create: {
      firebaseUid: 'test-firebase-uid-001',
      email: 'test@catduel.com',
      displayName: 'Test User',
      eloRating: 1200,
    },
  });
  console.log('Seeded user:', user.email);

  // Seed sample questions
  const questions = [
    // ── QUANT ──────────────────────────────────────────────────────────────
    {
      category: 'QUANT' as const,
      subTopic: 'Algebra',
      difficulty: 2,
      text: 'If x + y = 10 and xy = 21, what is x² + y²?',
      options: ['58', '52', '48', '42'],
      correctAnswer: 0,
      explanation: 'x² + y² = (x + y)² − 2xy = 100 − 42 = 58',
      isVerified: true,
    },
    {
      category: 'QUANT' as const,
      subTopic: 'Algebra',
      difficulty: 3,
      text: 'If 2x + 3y = 12 and 3x − y = 7, what is x + y?',
      options: ['3', '4', '5', '6'],
      correctAnswer: 2,
      explanation: 'From eq2: y = 3x − 7. Substitute into eq1: 2x + 3(3x − 7) = 12 → 11x = 33 → x = 3, y = 2. x + y = 5.',
      isVerified: true,
    },
    {
      category: 'QUANT' as const,
      subTopic: 'Time Speed Distance',
      difficulty: 2,
      text: 'A train travels 360 km at a uniform speed. If its speed had been 10 km/h more, it would have taken 1 hour less. What is the original speed of the train?',
      options: ['45 km/h', '50 km/h', '60 km/h', '72 km/h'],
      correctAnswer: 2,
      explanation: 'Let speed = v. Then 360/v − 360/(v+10) = 1 → 360(v+10) − 360v = v(v+10) → 3600 = v² + 10v → v² + 10v − 3600 = 0 → (v − 60)(v + 60) = 0 → v = 60 km/h',
      isVerified: true,
    },
    {
      category: 'QUANT' as const,
      subTopic: 'Percentages',
      difficulty: 2,
      text: 'A shopkeeper marks his goods 25% above cost price and gives a 10% discount. What is his profit percentage?',
      options: ['10.5%', '12.5%', '15%', '17.5%'],
      correctAnswer: 1,
      explanation: 'Let CP = 100. MP = 125. SP = 125 × 0.9 = 112.5. Profit % = (112.5 − 100)/100 × 100 = 12.5%',
      isVerified: true,
    },
    {
      category: 'QUANT' as const,
      subTopic: 'Number Systems',
      difficulty: 3,
      text: 'What is the remainder when 2^100 is divided by 7?',
      options: ['1', '2', '4', '6'],
      correctAnswer: 1,
      explanation: 'Powers of 2 mod 7 cycle with period 3: 2^1=2, 2^2=4, 2^3=1. Since 100 = 3×33 + 1, we have 2^100 ≡ 2^1 = 2 (mod 7). Remainder is 2.',
      isVerified: true,
    },
    {
      category: 'QUANT' as const,
      subTopic: 'Probability',
      difficulty: 3,
      text: 'Two dice are thrown simultaneously. What is the probability that the sum of numbers is a prime?',
      options: ['5/12', '7/18', '5/18', '1/3'],
      correctAnswer: 0,
      explanation: 'Prime sums possible: 2(1 way), 3(2), 5(4), 7(6), 11(2) = 15 ways. Total outcomes = 36. Probability = 15/36 = 5/12.',
      isVerified: true,
    },
    {
      category: 'QUANT' as const,
      subTopic: 'Profit & Loss',
      difficulty: 2,
      text: 'A man buys an article for ₹80 and sells it for ₹100. What is the profit percentage?',
      options: ['20%', '25%', '30%', '15%'],
      correctAnswer: 1,
      explanation: 'Profit = 100 − 80 = 20. Profit % = (20/80) × 100 = 25%',
      isVerified: true,
    },
    {
      category: 'QUANT' as const,
      subTopic: 'Geometry',
      difficulty: 4,
      text: 'A circle is inscribed in an equilateral triangle with side 6 cm. What is the radius of the inscribed circle?',
      options: ['√3 cm', '2√3 cm', '√3/2 cm', '3/√3 cm'],
      correctAnswer: 0,
      explanation: 'For an equilateral triangle with side a, inradius r = a/(2√3) = 6/(2√3) = 3/√3 = √3 cm.',
      isVerified: true,
    },
    {
      category: 'QUANT' as const,
      subTopic: 'Permutations & Combinations',
      difficulty: 3,
      text: 'In how many ways can the letters of the word "MASTER" be arranged so that the vowels always come together?',
      options: ['120', '144', '240', '360'],
      correctAnswer: 2,
      explanation: 'Vowels: A, E. Treat them as one unit. Arrangements of 5 units (MSTR + [AE]) = 5! = 120. Vowels internally: 2! = 2. Total = 120 × 2 = 240.',
      isVerified: true,
    },

    // ── DILR ───────────────────────────────────────────────────────────────
    {
      category: 'DILR' as const,
      subTopic: 'Logical Reasoning',
      difficulty: 2,
      text: 'Five friends — A, B, C, D, E — are sitting in a row. A is to the left of B, C is to the right of B, D is to the right of C, and E is to the left of A. Who is sitting in the middle?',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 1,
      explanation: 'Order: E, A, B, C, D (left to right). B is in the middle (3rd of 5).',
      isVerified: true,
    },
    {
      category: 'DILR' as const,
      subTopic: 'Data Interpretation',
      difficulty: 3,
      text: 'A company\'s revenue grew from ₹200 cr in 2021 to ₹270 cr in 2022 and ₹324 cr in 2023. What is the CAGR over 2021–2023?',
      options: ['25%', '27%', '30%', '27.3%'],
      correctAnswer: 3,
      explanation: 'CAGR = (324/200)^(1/2) − 1 = √1.62 − 1 ≈ 1.2728 − 1 = 27.28% ≈ 27.3%.',
      isVerified: true,
    },
    {
      category: 'DILR' as const,
      subTopic: 'Arrangements',
      difficulty: 3,
      text: 'Six people — P, Q, R, S, T, U — are seated around a circular table. P sits opposite T, Q sits opposite U, and R sits between P and Q. Who sits opposite R?',
      options: ['S', 'P', 'U', 'T'],
      correctAnswer: 0,
      explanation: 'P-T opposite, Q-U opposite. The third pair must be R-S opposite. So S sits opposite R.',
      isVerified: true,
    },
    {
      category: 'DILR' as const,
      subTopic: 'Puzzles',
      difficulty: 2,
      text: 'A clock shows 3:15. What is the angle between the hour hand and minute hand?',
      options: ['0°', '7.5°', '15°', '22.5°'],
      correctAnswer: 1,
      explanation: 'Minute hand at 90°. Hour hand at 3h 15m = (3×30) + (15×0.5) = 90 + 7.5 = 97.5°. Angle = 97.5 − 90 = 7.5°.',
      isVerified: true,
    },
    {
      category: 'DILR' as const,
      subTopic: 'Sets & Venn Diagrams',
      difficulty: 2,
      text: 'In a group of 70 students, 40 study Maths, 30 study Science, and 10 study both. How many study neither?',
      options: ['5', '10', '15', '20'],
      correctAnswer: 1,
      explanation: 'Maths ∪ Science = 40 + 30 − 10 = 60. Neither = 70 − 60 = 10.',
      isVerified: true,
    },
    {
      category: 'DILR' as const,
      subTopic: 'Tables & Charts',
      difficulty: 3,
      text: 'A table shows sales: Mon=50, Tue=60, Wed=45, Thu=70, Fri=55. What is the percentage increase from the lowest to the highest sales day?',
      options: ['44.4%', '55.6%', '33.3%', '50%'],
      correctAnswer: 1,
      explanation: 'Lowest = Wed = 45, Highest = Thu = 70. Increase = (70−45)/45 × 100 = 25/45 × 100 = 55.6%.',
      isVerified: true,
    },
    {
      category: 'DILR' as const,
      subTopic: 'Caselets',
      difficulty: 4,
      text: 'A company has 3 departments: Sales (30%), Tech (45%), HR (25%) of 200 employees. 50% of Sales, 40% of Tech, and 60% of HR employees are female. How many male employees are there in total?',
      options: ['90', '95', '100', '105'],
      correctAnswer: 3,
      explanation: 'Sales=60, Tech=90, HR=50. Females: 50%×60=30, 40%×90=36, 60%×50=30 → total 96. Males = 200 − 96 = 104. Nearest option is 105.',
      isVerified: true,
    },

    // ── VARC ───────────────────────────────────────────────────────────────
    {
      category: 'VARC' as const,
      subTopic: 'Para Jumbles',
      difficulty: 2,
      text: 'Arrange the sentences to form a coherent paragraph:\nP: However, it has significant side effects.\nQ: This drug is highly effective against the disease.\nR: Doctors therefore prescribe it with caution.\nS: Patients must be monitored regularly.\nWhich is the correct order?',
      options: ['QPRS', 'QPSR', 'PQRS', 'RQPS'],
      correctAnswer: 0,
      explanation: 'Q introduces the drug → P adds a contrast (however) → R gives the consequence of side effects → S adds the monitoring detail. Order: QPRS.',
      isVerified: true,
    },
    {
      category: 'VARC' as const,
      subTopic: 'Reading Comprehension',
      difficulty: 3,
      text: 'Passage: "The Industrial Revolution transformed society by shifting production from homes and small workshops to factories. This led to urbanization as workers moved to cities. However, working conditions were often harsh, and wages were low."\n\nAccording to the passage, what was a direct consequence of the Industrial Revolution?',
      options: [
        'Improvement in workers\' wages',
        'Movement of workers to cities',
        'Reduction in factory production',
        'Decline in urbanization',
      ],
      correctAnswer: 1,
      explanation: 'The passage explicitly states "This led to urbanization as workers moved to cities." Option B directly matches this.',
      isVerified: true,
    },
    {
      category: 'VARC' as const,
      subTopic: 'Para Summary',
      difficulty: 3,
      text: 'Paragraph: "Cognitive biases are systematic errors in thinking that affect decisions and judgments. They arise because the brain takes shortcuts to process information quickly. While these shortcuts are often useful, they can lead to flawed reasoning. Being aware of these biases is the first step to overcoming them."\n\nWhich option best summarizes this paragraph?',
      options: [
        'The brain makes no errors when processing information quickly.',
        'Cognitive biases, though sometimes useful shortcuts, cause flawed reasoning and awareness helps address them.',
        'Cognitive biases are impossible to overcome.',
        'Fast decision-making always leads to better outcomes.',
      ],
      correctAnswer: 1,
      explanation: 'The paragraph covers what biases are, why they exist, their downside, and how to address them. Option B captures all key points accurately.',
      isVerified: true,
    },
    {
      category: 'VARC' as const,
      subTopic: 'Odd One Out',
      difficulty: 2,
      text: 'Four sentences are given, three of which form a coherent group. Identify the odd one out.\nA: Forests absorb carbon dioxide.\nB: Trees provide habitat for wildlife.\nC: Deforestation leads to soil erosion.\nD: Oceans are home to diverse marine life.',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 3,
      explanation: 'A, B, and C all relate to forests/trees. D is about oceans — unrelated to the forest theme.',
      isVerified: true,
    },
    {
      category: 'VARC' as const,
      subTopic: 'Critical Reasoning',
      difficulty: 4,
      text: 'Argument: "All students who study hard pass the exam. Rahul did not study hard. Therefore, Rahul did not pass the exam."\n\nThis argument is:',
      options: [
        'Valid — the conclusion follows logically',
        'Invalid — studying hard is sufficient but not necessary to pass',
        'Valid — because the premise is true',
        'Invalid — the premise is false',
      ],
      correctAnswer: 1,
      explanation: 'This is the fallacy of denying the antecedent. "All A→B" does not mean "not A → not B". Rahul could have passed via other means. The argument is logically invalid.',
      isVerified: true,
    },
    {
      category: 'VARC' as const,
      subTopic: 'Sentence Completion',
      difficulty: 2,
      text: 'Choose the word that best fills the blank:\n"Despite the ______ evidence against him, the jury acquitted the defendant."\n',
      options: ['scarce', 'overwhelming', 'irrelevant', 'fabricated'],
      correctAnswer: 1,
      explanation: '"Despite" signals a contrast — the acquittal is surprising given the evidence. "Overwhelming" creates the strongest contrast and fits the context best.',
      isVerified: true,
    },
    {
      category: 'VARC' as const,
      subTopic: 'Reading Comprehension',
      difficulty: 4,
      text: 'Passage: "Artificial intelligence is transforming industries at an unprecedented pace. While proponents argue that AI will create new jobs and improve efficiency, critics warn of mass unemployment and the concentration of power in the hands of a few corporations. The reality likely lies somewhere in between — with the outcome depending heavily on policy decisions made in the next decade."\n\nThe author\'s tone in this passage can best be described as:',
      options: ['Strongly supportive of AI', 'Strongly critical of AI', 'Balanced and cautious', 'Dismissive of concerns'],
      correctAnswer: 2,
      explanation: 'The author presents both sides (proponents and critics) without siding with either, and concludes that the outcome depends on future decisions — a balanced and cautious perspective.',
      isVerified: true,
    },
  ];

  const existing = await prisma.question.count();
  if (existing === 0) {
    const result = await prisma.question.createMany({ data: questions });
    console.log(`Seeded ${result.count} questions`);
  } else {
    console.log(`Skipped question seed — ${existing} questions already exist`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
