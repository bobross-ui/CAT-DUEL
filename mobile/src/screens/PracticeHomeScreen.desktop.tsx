import { useCallback, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DesktopFrame from '../components/web/DesktopFrame';
import PageContainer from '../components/web/PageContainer';
import EyebrowLabel from '../components/web/EyebrowLabel';
import Text from '../components/Text';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useTheme } from '../theme/ThemeProvider';
import MobilePracticeHomeScreen from './PracticeHomeScreen.mobile';

type Props = ComponentProps<typeof MobilePracticeHomeScreen>;
type CategoryKey = 'QUANT' | 'DILR' | 'VARC';

const CATEGORIES: {
  key: CategoryKey;
  kicker: string;
  title: string;
  description: string;
}[] = [
  {
    key: 'QUANT',
    kicker: 'QUANT',
    title: 'Quantitative Aptitude',
    description: 'Numbers, algebra, arithmetic, and geometry.',
  },
  {
    key: 'DILR',
    kicker: 'DILR',
    title: 'Data Interpretation & Logic',
    description: 'Sets, charts, arrangements, and reasoning.',
  },
  {
    key: 'VARC',
    kicker: 'VARC',
    title: 'Verbal Ability & RC',
    description: 'Reading comprehension, grammar, and verbal logic.',
  },
];

const DIFFICULTIES: { label: string; value: number | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Easy', value: 1 },
  { label: 'Medium', value: 3 },
  { label: 'Hard', value: 4 },
];

export default function PracticeHomeScreenDesktop({ navigation }: Props) {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<CategoryKey | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | undefined>(undefined);

  useDocumentTitle('Practice · CAT Duel');

  const startPractice = useCallback((category: CategoryKey) => {
    navigation.navigate('Question', {
      category,
      difficulty: selectedDifficulty,
    });
  }, [navigation, selectedDifficulty]);

  return (
    <DesktopFrame activeRoute="PracticeHome">
      <PageContainer style={styles.page}>
        <View style={styles.header}>
          <Text.Serif preset="display" color={theme.ink} style={styles.title}>
            <Text.Serif preset="display" color={theme.accentDeep} style={styles.italic}>Practice</Text.Serif>
          </Text.Serif>
          <Text.Serif preset="italic" color={theme.ink2} style={styles.subtitle}>
            No rating change. No opponent. Just you and the questions.
          </Text.Serif>
        </View>

        <View style={styles.sectionHeader}>
          <EyebrowLabel>Sections</EyebrowLabel>
        </View>

        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category) => {
            const isSelected = selectedCategory === category.key;
            const isHovered = hoveredCategory === category.key;
            const isHighlighted = isSelected || isHovered;
            return (
              <Pressable
                key={category.key}
                onPress={() => setSelectedCategory(category.key)}
                onHoverIn={() => setHoveredCategory(category.key)}
                onHoverOut={() => setHoveredCategory(null)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${category.title} practice`}
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [
                  styles.categoryCard,
                  {
                    backgroundColor: isHighlighted ? theme.accentSoft : theme.card,
                    borderColor: isHighlighted ? theme.accent : theme.line,
                    opacity: pressed ? 0.86 : 1,
                  },
                ]}
              >
                <View style={styles.cardTop}>
                  <View>
                    <EyebrowLabel color={isSelected ? theme.accentDeep : theme.ink3}>
                      {category.kicker}
                    </EyebrowLabel>
                    <Text.Serif preset="h1Serif" color={theme.ink} style={styles.cardTitle}>
                      {category.title}
                    </Text.Serif>
                  </View>
                </View>

                <Text.Sans preset="body" color={theme.ink2} numberOfLines={1} style={styles.cardDescription}>
                  {category.description}
                </Text.Sans>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.difficultyBlock}>
          <EyebrowLabel>Difficulty</EyebrowLabel>
          <View style={[styles.segmented, { backgroundColor: theme.bg2, borderColor: theme.line }]}>
            {DIFFICULTIES.map((difficulty) => {
              const isSelected = selectedDifficulty === difficulty.value;
              return (
                <Pressable
                  key={difficulty.label}
                  onPress={() => setSelectedDifficulty(difficulty.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${difficulty.label} difficulty`}
                  accessibilityState={{ selected: isSelected }}
                  style={({ pressed }) => [
                    styles.segment,
                    {
                      backgroundColor: isSelected ? theme.ink : 'transparent',
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <Text.Sans preset="label" color={isSelected ? theme.bg : theme.ink2}>
                    {difficulty.label}
                  </Text.Sans>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => {
            if (selectedCategory) startPractice(selectedCategory);
          }}
          disabled={!selectedCategory}
          accessibilityRole="button"
          accessibilityLabel="Start practice"
          accessibilityState={{ disabled: !selectedCategory }}
          style={({ pressed }) => [
            styles.startButton,
            {
              backgroundColor: selectedCategory ? theme.ink : theme.bg2,
              borderColor: selectedCategory ? theme.ink : theme.line,
              opacity: pressed ? 0.84 : 1,
            },
          ]}
        >
          <Text.Sans preset="bodyMed" color={selectedCategory ? theme.bg : theme.ink3}>Start Practice</Text.Sans>
          <Feather name="arrow-right" size={18} color={selectedCategory ? theme.bg : theme.ink3} />
        </Pressable>
      </PageContainer>
    </DesktopFrame>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 60,
    paddingTop: 32,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    marginBottom: 10,
  },
  italic: {
    fontStyle: 'italic',
  },
  subtitle: {
    maxWidth: 620,
  },
  sectionHeader: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryGrid: {
    flexDirection: 'row',
    gap: 16,
  },
  categoryCard: {
    flex: 1,
    minHeight: 150,
    borderWidth: 1,
    borderRadius: 14,
    padding: 22,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardTitle: {
    marginTop: 8,
  },
  cardDescription: {
    marginTop: 20,
  },
  difficultyBlock: {
    marginTop: 32,
    gap: 12,
    alignItems: 'flex-start',
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  segment: {
    minWidth: 88,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  startButton: {
    marginTop: 28,
    minHeight: 50,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
});
