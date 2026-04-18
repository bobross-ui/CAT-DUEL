import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/Button';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeHome'>;

const CATEGORIES = [
  { key: 'QUANT', label: 'Quantitative\nAptitude', emoji: '🔢' },
  { key: 'DILR', label: 'Data Interpretation\n& Logical Reasoning', emoji: '📊' },
  { key: 'VARC', label: 'Verbal Ability\n& Reading Comprehension', emoji: '📝' },
] as const;

const DIFFICULTIES = [
  { label: 'All', value: undefined },
  { label: 'Easy (1–2)', value: 1 },
  { label: 'Medium (3)', value: 3 },
  { label: 'Hard (4–5)', value: 4 },
];

export default function PracticeHomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | undefined>(undefined);

  const canStart = selectedCategory !== null;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <AppText.Sans preset="body" color={theme.ink2}>← Back</AppText.Sans>
      </TouchableOpacity>

      <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.title}>Practice</AppText.Serif>
      <AppText.Sans preset="body" color={theme.ink2} style={styles.subtitle}>Choose a category to begin</AppText.Sans>

      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.categoryCard,
                { borderColor: isSelected ? theme.ink : theme.line, backgroundColor: isSelected ? theme.bg2 : theme.bg },
              ]}
              onPress={() => setSelectedCategory(cat.key)}
            >
              <AppText.Sans style={styles.categoryEmoji}>{cat.emoji}</AppText.Sans>
              <AppText.Sans preset="bodyMed" color={isSelected ? theme.ink : theme.ink2} style={styles.categoryLabel}>
                {cat.label}
              </AppText.Sans>
            </TouchableOpacity>
          );
        })}
      </View>

      <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.sectionLabel}>Difficulty</AppText.Mono>
      <View style={styles.difficultyRow}>
        {DIFFICULTIES.map((d) => {
          const isSelected = selectedDifficulty === d.value;
          return (
            <TouchableOpacity
              key={d.label}
              style={[
                styles.difficultyChip,
                {
                  borderColor: isSelected ? theme.ink : theme.line,
                  backgroundColor: isSelected ? theme.ink : 'transparent',
                },
              ]}
              onPress={() => setSelectedDifficulty(d.value)}
            >
              <AppText.Sans preset="label" color={isSelected ? theme.bg : theme.ink2}>
                {d.label}
              </AppText.Sans>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button
        label="Start Practice"
        onPress={() => {
          if (canStart) {
            navigation.navigate('Question', {
              category: selectedCategory!,
              difficulty: selectedDifficulty,
            });
          }
        }}
        disabled={!canStart}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  backButton: {
    marginBottom: 24,
  },
  title: {
    marginBottom: 6,
  },
  subtitle: {
    marginBottom: 32,
  },
  categoryGrid: {
    gap: 12,
    marginBottom: 32,
  },
  categoryCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  categoryEmoji: {
    fontSize: 28,
  },
  categoryLabel: {
    flex: 1,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  difficultyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 40,
  },
  difficultyChip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
