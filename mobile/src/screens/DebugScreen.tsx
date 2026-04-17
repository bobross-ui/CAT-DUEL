import { ScrollView, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, tierColors } from '../theme/tokens';
import Text from '../components/Text';
import Button from '../components/Button';
import Card from '../components/Card';
import Chip from '../components/Chip';
import Avatar from '../components/Avatar';
import TierBadge from '../components/TierBadge';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.section, { borderBottomColor: theme.line }]}>
      <Text.Mono preset="eyebrow" color={theme.ink3} style={{ textTransform: 'uppercase', marginBottom: spacing.md }}>
        {title}
      </Text.Mono>
      {children}
    </View>
  );
}

export default function DebugScreen() {
  const { theme, mode, preference, setPreference } = useTheme();

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.container}>
      <Text.Serif preset="heroSerif">Design System</Text.Serif>
      <Text.Sans preset="small" color={theme.ink3} style={{ marginBottom: spacing.xxl }}>
        Mode: {mode} | Preference: {preference}
      </Text.Sans>

      {/* Theme toggle */}
      <Section title="Theme">
        <View style={styles.row}>
          {(['system', 'light', 'dark'] as const).map((p) => (
            <Chip key={p} label={p} variant={preference === p ? 'accent' : 'default'} />
          ))}
        </View>
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          {(['system', 'light', 'dark'] as const).map((p) => (
            <Button
              key={p}
              label={p}
              variant={preference === p ? 'primary' : 'ghost'}
              onPress={() => setPreference(p)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </Section>

      {/* Typography — Serif */}
      <Section title="Typography — Serif">
        <Text.Serif preset="display">Display 40</Text.Serif>
        <Text.Serif preset="verdict">Verdict 30</Text.Serif>
        <Text.Serif preset="heroSerif">Hero Serif 26</Text.Serif>
        <Text.Serif preset="h1Serif">H1 Serif 22</Text.Serif>
        <Text.Serif preset="questionLg">Question Lg 19</Text.Serif>
        <Text.Serif preset="scoreLg">Score Lg 22</Text.Serif>
        <Text.Serif preset="statVal">Stat Val 20</Text.Serif>
        <Text.Serif preset="italic">Italic 18</Text.Serif>
      </Section>

      {/* Typography — Sans */}
      <Section title="Typography — Sans">
        <Text.Sans preset="body">Body 15 — regular</Text.Sans>
        <Text.Sans preset="bodyMed">Body Med 15 — medium</Text.Sans>
        <Text.Sans preset="label">Label 13 — medium</Text.Sans>
        <Text.Sans preset="small">Small 12 — regular</Text.Sans>
      </Section>

      {/* Typography — Mono */}
      <Section title="Typography — Mono">
        <Text.Mono preset="mono">Mono 13 — 1234567890</Text.Mono>
        <Text.Mono preset="timer">Timer 13 — 06:42</Text.Mono>
        <Text.Mono preset="deltaLg" color={theme.accent}>+14</Text.Mono>
        <Text.Mono preset="chipLabel" style={{ textTransform: 'uppercase' }}>Chip Label — Rating</Text.Mono>
        <Text.Mono preset="statusBar">Status Bar 11</Text.Mono>
        <Text.Mono preset="eyebrow" style={{ textTransform: 'uppercase' }}>Eyebrow — Q 8 of 20</Text.Mono>
      </Section>

      {/* Palette swatches */}
      <Section title="Palette">
        {(['bg', 'bg2', 'card', 'ink', 'ink2', 'ink3', 'ink4', 'accent', 'accentSoft', 'accentDeep', 'coral', 'coralSoft', 'amber'] as const).map((key) => (
          <View key={key} style={styles.swatchRow}>
            <View style={[styles.swatch, { backgroundColor: theme[key] }]} />
            <Text.Mono preset="mono" color={theme.ink2}>{key}</Text.Mono>
          </View>
        ))}
      </Section>

      {/* Buttons */}
      <Section title="Buttons">
        <View style={styles.stack}>
          <Button label="Primary (accent)" variant="primary" onPress={() => {}} />
          <Button label="Ghost" variant="ghost" onPress={() => {}} />
          <Button label="Dark" variant="dark" onPress={() => {}} />
          <Button label="Coral" variant="coral" onPress={() => {}} />
          <Button label="Disabled" variant="primary" disabled onPress={() => {}} />
          <Button label="Loading" variant="primary" loading onPress={() => {}} />
        </View>
      </Section>

      {/* Card */}
      <Section title="Card">
        <Card>
          <Text.Serif preset="h1Serif">Card title</Text.Serif>
          <Text.Sans preset="body" color={theme.ink2} style={{ marginTop: spacing.xs }}>
            Body text inside a card with line border and card background.
          </Text.Sans>
        </Card>
      </Section>

      {/* Chips */}
      <Section title="Chips">
        <View style={styles.row}>
          <Chip label="Default" />
          <Chip label="Accent" variant="accent" />
          <Chip label="Coral" variant="coral" />
          <Chip label="Dark" variant="dark" />
        </View>
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          <Chip label="With dot" variant="accent" dot />
          <Chip label="Searching" variant="default" dot />
        </View>
      </Section>

      {/* Avatars */}
      <Section title="Avatars">
        <View style={styles.row}>
          <Avatar name="You" size="sm" variant="you" />
          <Avatar name="You" size="md" variant="you" />
          <Avatar name="You" size="lg" variant="you" />
          <Avatar name="You" size="xl" variant="you" />
        </View>
        <View style={[styles.row, { marginTop: spacing.md }]}>
          <Avatar name="Opp" size="sm" variant="opponent" />
          <Avatar name="Opp" size="md" variant="opponent" />
          <Avatar name="Opp" size="lg" variant="opponent" />
          <Avatar name="Opp" size="xl" variant="opponent" />
        </View>
      </Section>

      {/* Tier badges */}
      <Section title="Tier Badges">
        <View style={styles.row}>
          {Object.keys(tierColors).map((tier) => (
            <TierBadge key={tier} tier={tier} />
          ))}
        </View>
        <View style={[styles.row, { marginTop: spacing.sm }]}>
          {Object.keys(tierColors).map((tier) => (
            <TierBadge key={tier} tier={tier} small />
          ))}
        </View>
      </Section>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxl,
    paddingTop: 60,
  },
  section: {
    borderBottomWidth: 1,
    paddingBottom: spacing.xl,
    marginBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stack: {
    gap: spacing.sm,
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
});
