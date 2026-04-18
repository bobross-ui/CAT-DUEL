import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
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
        <Text style={[styles.backText, { color: theme.ink2 }]}>← Back</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: theme.ink }]}>Practice</Text>
      <Text style={[styles.subtitle, { color: theme.ink2 }]}>Choose a category to begin</Text>

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
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text style={[styles.categoryLabel, { color: isSelected ? theme.ink : theme.ink2 }]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, { color: theme.ink3 }]}>Difficulty</Text>
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
              <Text style={[styles.difficultyText, { color: isSelected ? theme.bg : theme.ink2 }]}>
                {d.label}
              </Text>
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
  backText: {
    fontSize: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
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
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  difficultyText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
