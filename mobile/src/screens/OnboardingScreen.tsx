import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Card from '../components/Card';
import AppText from '../components/Text';
import TierBadge from '../components/TierBadge';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';

type CompletionTarget = 'home' | 'practice' | 'match';

interface Props {
  onCompleted: (target: CompletionTarget, completedAt: string) => void;
}

const SLIDES = [
  {
    eyebrow: 'WELCOME',
    title: 'CAT Duel.',
    body: 'prep like you compete.',
    kind: 'welcome',
  },
  {
    eyebrow: 'HOW IT WORKS',
    title: 'Match up. Race to solve.',
    body: 'You and your rival see the same 20 questions. Whoever answers more correctly in 10 minutes wins.',
    kind: 'duel',
  },
  {
    eyebrow: 'RANKED',
    title: 'Climb from Bronze to Diamond.',
    body: 'Every win lifts your rating. Every loss tests it. Your tier updates automatically.',
    kind: 'tiers',
  },
  {
    eyebrow: 'READY',
    title: 'Ready.',
    body: 'Start with practice, or jump straight into a ranked duel.',
    kind: 'ready',
  },
] as const;

export default function OnboardingScreen({ onCompleted }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [slideWidth, setSlideWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [loadingTarget, setLoadingTarget] = useState<CompletionTarget | null>(null);
  const [error, setError] = useState('');

  const goToSlide = (nextIndex: number) => {
    scrollRef.current?.scrollTo({ x: nextIndex * slideWidth, animated: true });
    setIndex(nextIndex);
  };

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!slideWidth) return;
    setIndex(Math.round(event.nativeEvent.contentOffset.x / slideWidth));
  };

  const complete = async (target: CompletionTarget) => {
    setError('');
    setLoadingTarget(target);
    const completedAt = new Date().toISOString();
    try {
      await api.patch('/users/me', { onboardingCompletedAt: completedAt });
      onCompleted(target, completedAt);
    } catch {
      setError("Couldn't save onboarding. Check your connection and try again.");
      setLoadingTarget(null);
    }
  };

  const currentSlide = SLIDES[index];

  return (
    <View
      style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top + spacing.md }]}
      onLayout={(event) => setSlideWidth(event.nativeEvent.layout.width)}
    >
      {index < SLIDES.length - 1 && (
        <TouchableOpacity
          style={styles.skip}
          onPress={() => complete('home')}
          disabled={loadingTarget !== null}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Skip onboarding"
          accessibilityState={{ disabled: loadingTarget !== null }}
        >
          <AppText.Mono preset="eyebrow" color={theme.ink3}>SKIP</AppText.Mono>
        </TouchableOpacity>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEnabled={loadingTarget === null}
        style={styles.scroller}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width: slideWidth || undefined }]}>
            <View style={styles.copy}>
              <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.eyebrow}>
                {slide.eyebrow}
              </AppText.Mono>
              <AppText.Serif preset="display" color={theme.ink} style={styles.title}>
                {slide.title}
              </AppText.Serif>
              <AppText.Serif
                preset={slide.kind === 'welcome' ? 'italic' : 'h1Serif'}
                color={slide.kind === 'welcome' ? theme.accentDeep : theme.ink2}
                style={styles.body}
              >
                {slide.body}
              </AppText.Serif>
            </View>

            <Illustration kind={slide.kind} />
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, dotIndex) => (
            <View
              key={slide.title}
              style={[
                styles.dot,
                {
                  backgroundColor: dotIndex === index ? theme.ink : theme.line,
                  width: dotIndex === index ? 22 : 7,
                },
              ]}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`Onboarding slide ${dotIndex + 1} of ${SLIDES.length}`}
              accessibilityState={{ selected: dotIndex === index }}
            />
          ))}
        </View>

        {error ? (
          <AppText.Sans preset="label" color={theme.coral} style={styles.error}>
            {error}
          </AppText.Sans>
        ) : null}

        {currentSlide.kind === 'ready' ? (
          <View style={styles.readyActions}>
            <Button
              label="Practice first"
              variant="dark"
              onPress={() => complete('practice')}
              loading={loadingTarget === 'practice'}
              disabled={loadingTarget !== null}
              style={styles.actionButton}
            />
            <Button
              label="Find a match"
              onPress={() => complete('match')}
              loading={loadingTarget === 'match'}
              disabled={loadingTarget !== null}
              style={styles.actionButton}
            />
          </View>
        ) : (
          <Button
            label={index === 0 ? 'Get started →' : 'Continue →'}
            onPress={() => goToSlide(Math.min(index + 1, SLIDES.length - 1))}
            disabled={!slideWidth || loadingTarget !== null}
          />
        )}

        {loadingTarget === 'home' && <ActivityIndicator color={theme.ink3} style={styles.saving} />}
      </View>
    </View>
  );
}

function Illustration({ kind }: { kind: (typeof SLIDES)[number]['kind'] }) {
  const { theme } = useTheme();

  if (kind === 'duel') {
    return (
      <Card style={styles.duelCard}>
        <Avatar name="you" size="lg" />
        <View style={[styles.dashedLine, { borderColor: theme.ink4 }]} />
        <AppText.Mono preset="deltaLg" color={theme.accentDeep}>◆</AppText.Mono>
        <View style={[styles.dashedLine, { borderColor: theme.ink4 }]} />
        <Avatar name="rival" size="lg" variant="opponent" />
      </Card>
    );
  }

  if (kind === 'tiers') {
    return (
      <Card style={styles.tierCard}>
        {['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'].map((tier) => (
          <TierBadge key={tier} tier={tier} />
        ))}
      </Card>
    );
  }

  if (kind === 'ready') {
    return (
      <Card style={styles.readyCard}>
        <AppText.Mono preset="eyebrow" color={theme.ink3}>10-MIN DUEL</AppText.Mono>
        <AppText.Serif preset="heroSerif" color={theme.ink} style={styles.readyTitle}>
          Mixed questions. Ranked stakes.
        </AppText.Serif>
        <View style={[styles.readyRule, { borderColor: theme.line }]}>
          <AppText.Mono preset="mono" color={theme.accentDeep}>20 QUESTIONS</AppText.Mono>
          <AppText.Mono preset="mono" color={theme.ink3}>◆ 1200</AppText.Mono>
        </View>
      </Card>
    );
  }

  return (
    <View style={[styles.heroMark, { backgroundColor: theme.ink }]}>
      <AppText.Serif preset="display" color={theme.bg}>CAT</AppText.Serif>
      <AppText.Mono preset="eyebrow" color={theme.accent}>DUEL</AppText.Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  skip: {
    position: 'absolute',
    right: spacing.xl,
    top: spacing.xxl,
    zIndex: 2,
  },
  scroller: {
    flex: 1,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  copy: {
    marginBottom: spacing.huge,
  },
  eyebrow: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  title: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xxl,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 7,
    marginBottom: spacing.xl,
  },
  dot: {
    height: 7,
    borderRadius: radii.pill,
  },
  error: {
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  readyActions: {
    gap: spacing.sm,
  },
  actionButton: {
    width: '100%',
  },
  saving: {
    marginTop: spacing.md,
  },
  heroMark: {
    alignSelf: 'center',
    width: 176,
    height: 176,
    borderRadius: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  duelCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  dashedLine: {
    width: 42,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    marginHorizontal: spacing.sm,
  },
  tierCard: {
    alignSelf: 'center',
    gap: spacing.sm,
    minWidth: 180,
    alignItems: 'stretch',
  },
  readyCard: {
    gap: spacing.lg,
  },
  readyTitle: {
    textAlign: 'center',
  },
  readyRule: {
    borderTopWidth: 1,
    paddingTop: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
