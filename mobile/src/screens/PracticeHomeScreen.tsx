import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';

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
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | undefined>(undefined);

  const canStart = selectedCategory !== null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Practice</Text>
      <Text style={styles.subtitle}>Choose a category to begin</Text>

      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.categoryCard, selectedCategory === cat.key && styles.categoryCardSelected]}
            onPress={() => setSelectedCategory(cat.key)}
          >
            <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
            <Text style={[styles.categoryLabel, selectedCategory === cat.key && styles.categoryLabelSelected]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Difficulty</Text>
      <View style={styles.difficultyRow}>
        {DIFFICULTIES.map((d) => (
          <TouchableOpacity
            key={d.label}
            style={[styles.difficultyChip, selectedDifficulty === d.value && styles.difficultyChipSelected]}
            onPress={() => setSelectedDifficulty(d.value)}
          >
            <Text style={[styles.difficultyText, selectedDifficulty === d.value && styles.difficultyTextSelected]}>
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.startButton, !canStart && styles.startButtonDisabled]}
        onPress={() => {
          if (canStart) {
            navigation.navigate('Question', {
              category: selectedCategory!,
              difficulty: selectedDifficulty,
            });
          }
        }}
        disabled={!canStart}
      >
        <Text style={styles.startButtonText}>Start Practice</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
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
    color: '#666',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  categoryGrid: {
    gap: 12,
    marginBottom: 32,
  },
  categoryCard: {
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  categoryCardSelected: {
    borderColor: '#1a1a1a',
    backgroundColor: '#f5f5f5',
  },
  categoryEmoji: {
    fontSize: 28,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    flex: 1,
  },
  categoryLabelSelected: {
    color: '#1a1a1a',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
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
    borderColor: '#e5e5e5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  difficultyChipSelected: {
    borderColor: '#1a1a1a',
    backgroundColor: '#1a1a1a',
  },
  difficultyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  difficultyTextSelected: {
    color: '#fff',
  },
  startButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: '#ccc',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
