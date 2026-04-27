import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation';
import AppText from '../components/Text';
import { useTheme } from '../theme/ThemeProvider';
import Button from '../components/Button';
import Card from '../components/Card';
import { questionService } from '../services/questions';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeHome'>;

const CATEGORIES: { key: string; label: string; sub: string }[] = [
  { key: 'QUANT',  label: 'Quantitative Aptitude',               sub: 'QUANT'  },
  { key: 'DILR',   label: 'Data Interpretation & Logical Reason', sub: 'DILR'   },
  { key: 'VARC',   label: 'Verbal Ability & Reading Comp.',        sub: 'VARC'   },
];

const DIFFICULTIES: { label: string; value: number | undefined }[] = [
  { label: 'All',    value: undefined },
  { label: 'Easy',   value: 1 },
  { label: 'Medium', value: 3 },
  { label: 'Hard',   value: 4 },
];

export default function PracticeHomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<number | undefined>(undefined);
  const [practiceTotal, setPracticeTotal] = useState<number | null>(null);

  useEffect(() => {
    questionService
      .getSummary()
      .then((res) => setPracticeTotal(res.data.data.total))
      .catch(() => setPracticeTotal(null));
  }, []);

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <AppText.Sans preset="body" color={theme.ink2}>← Back</AppText.Sans>
      </TouchableOpacity>

      <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.title}>Practice</AppText.Serif>
      <AppText.Sans preset="body" color={theme.ink3} style={styles.subtitle}>
        Choose a section to begin
      </AppText.Sans>

      {practiceTotal === 0 && (
        <Card style={styles.emptyCard}>
          <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.emptyTitle}>
            You haven't practiced yet.
          </AppText.Serif>
          <AppText.Sans preset="body" color={theme.ink3} style={styles.emptyBody}>
            Pick a section below and start with full feedback.
          </AppText.Sans>
          <Button
            label="Start Practice"
            onPress={() => navigation.navigate('Question', { category: 'QUANT', difficulty: undefined })}
            style={styles.emptyCta}
          />
        </Card>
      )}

      {/* ── Section chips ── */}
      <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.sectionLabel}>SECTION</AppText.Mono>
      <View style={styles.chipRow}>
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.key;
          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.chip,
                {
                  backgroundColor: isSelected ? theme.accentSoft : theme.bg2,
                  borderColor: isSelected ? theme.accent : theme.line,
                },
              ]}
              onPress={() => setSelectedCategory(cat.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Select ${cat.label}`}
              accessibilityState={{ selected: isSelected }}
            >
              <AppText.Mono
                preset="chipLabel"
                color={isSelected ? theme.accentDeep : theme.ink2}
                style={styles.chipLabel}
              >
                {cat.sub}
              </AppText.Mono>
              <AppText.Sans
                preset="small"
                color={isSelected ? theme.accentDeep : theme.ink3}
                numberOfLines={2}
                style={styles.chipSub}
              >
                {cat.label}
              </AppText.Sans>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Difficulty chips ── */}
      <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.sectionLabel}>DIFFICULTY</AppText.Mono>
      <View style={styles.diffRow}>
        {DIFFICULTIES.map((d) => {
          const isSelected = selectedDifficulty === d.value;
          return (
            <TouchableOpacity
              key={d.label}
              style={[
                styles.diffChip,
                {
                  backgroundColor: isSelected ? theme.ink : 'transparent',
                  borderColor: isSelected ? theme.ink : theme.line,
                },
              ]}
              onPress={() => setSelectedDifficulty(d.value)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Select ${d.label} difficulty`}
              accessibilityState={{ selected: isSelected }}
            >
              <AppText.Sans preset="label" color={isSelected ? theme.bg : theme.ink2}>
                {d.label}
              </AppText.Sans>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button
        label="Begin Practice →"
        onPress={() => {
          if (selectedCategory) {
            navigation.navigate('Question', {
              category: selectedCategory,
              difficulty: selectedDifficulty,
            });
          }
        }}
        disabled={selectedCategory === null}
        accessibilityHint="Starts practice with the selected section and difficulty"
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 48,
    gap: 0,
  },
  title: { marginTop: 24, marginBottom: 6 },
  subtitle: { marginBottom: 32 },
  emptyCard: { marginBottom: 28 },
  emptyTitle: { marginBottom: 8 },
  emptyBody: { marginBottom: 16 },
  emptyCta: {},
  sectionLabel: { marginBottom: 10 },

  // Section chips
  chipRow: { gap: 8, marginBottom: 32 },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  chipLabel: { marginBottom: 4 },
  chipSub: {},

  // Difficulty chips
  diffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 40 },
  diffChip: {
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  cta: {},
});
