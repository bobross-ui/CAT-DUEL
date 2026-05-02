import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { z } from 'zod';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { useAppPreferences } from '../context/AppPreferencesContext';
import { RootStackParamList } from '../navigation';
import api from '../services/api';
import AppText from '../components/Text';
import Button from '../components/Button';
import Card from '../components/Card';
import ScreenTransitionView from '../components/ScreenTransitionView';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { useCurrentProfile } from '../hooks/useCurrentProfile';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

interface SettingsProfile {
  email?: string;
  displayName: string | null;
}

const displayNameSchema = z.string().trim().min(2, 'Name must be at least 2 characters.').max(30, 'Name must be 30 characters or less.');
const appVersion = process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0';
const buildNumber = process.env.EXPO_PUBLIC_BUILD_NUMBER ?? 'dev';

export default function SettingsScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { theme, preference, setPreference } = useTheme();
  const {
    hapticsEnabled,
    analyticsEnabled,
    setHapticsEnabled,
    setAnalyticsEnabled,
  } = useAppPreferences();
  const { user: currentProfile, loading } = useCurrentProfile();
  const [profile, setProfile] = useState<SettingsProfile | null>(currentProfile);
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isEmailAuth = useMemo(
    () => user?.providerData.some((provider) => provider.providerId === 'password') ?? false,
    [user],
  );

  useEffect(() => {
    setProfile(currentProfile);
  }, [currentProfile]);

  function openEditName() {
    setEditName(profile?.displayName ?? '');
    setEditError('');
    setEditVisible(true);
  }

  async function saveDisplayName() {
    const parsed = displayNameSchema.safeParse(editName);
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]?.message ?? 'Enter a valid display name.');
      return;
    }

    setSavingName(true);
    setEditError('');
    try {
      await api.patch('/users/me', { displayName: parsed.data });
      setProfile((current) => current ? { ...current, displayName: parsed.data } : current);
      setEditVisible(false);
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      setEditError(code === 'DISPLAY_NAME_TAKEN' ? 'That name is already taken.' : 'Failed to save. Please try again.');
    } finally {
      setSavingName(false);
    }
  }

  function requestPasswordReset() {
    const email = profile?.email ?? user?.email;
    if (!email) return;

    Alert.alert(
      'Change password?',
      `We'll send a password reset link to ${email}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send link',
          onPress: async () => {
            try {
              await sendPasswordResetEmail(auth, email);
              Alert.alert('Link sent.', 'Check your inbox for the reset email.');
            } catch {
              Alert.alert("Couldn't send link.", 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  }

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      if (window.confirm('Sign out? You can sign back in any time.')) {
        void signOut();
      }
      return;
    }

    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  async function deleteAccount() {
    if (deleteConfirm !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.');
      return;
    }

    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete('/users/me');
      if (auth.currentUser) {
        await deleteUser(auth.currentUser).catch(() => {});
      }
      await signOut().catch(() => {});
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      setDeleteError(code === 'ACTIVE_MATCH'
        ? 'Finish your current match before deleting your account.'
        : 'Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function openUrl(url: string) {
    await WebBrowser.openBrowserAsync(url);
  }

  return (
    <>
      <ScreenTransitionView style={{ flex: 1, backgroundColor: theme.bg }}>
        <ScrollView
          style={{ backgroundColor: theme.bg }}
          contentContainerStyle={styles.container}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={navigation.goBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <AppText.Sans preset="bodyMed" color={theme.ink2}>← Back</AppText.Sans>
            </TouchableOpacity>
            <AppText.Serif preset="heroSerif" color={theme.ink}>Settings</AppText.Serif>
            <AppText.Sans preset="small" color={theme.ink3}>account · app · about</AppText.Sans>
          </View>

          <Section title="Account">
            <SettingsRow label="Email" value={loading ? 'loading…' : profile?.email ?? user?.email ?? '—'} />
            <SettingsRow
              label="Display name"
              value={profile?.displayName ?? 'Anonymous'}
              onPress={openEditName}
            />
            {isEmailAuth ? (
              <SettingsRow label="Change password" value="email link" onPress={requestPasswordReset} />
            ) : null}
          </Section>

          <Section title="Appearance">
            <View style={[styles.segmented, { backgroundColor: theme.bg2, borderColor: theme.line }]}>
              {(['system', 'light', 'dark'] as const).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.segment,
                    preference === item && { backgroundColor: theme.card, borderColor: theme.line },
                  ]}
                  onPress={() => setPreference(item)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${item} theme`}
                  accessibilityState={{ selected: preference === item }}
                >
                  <AppText.Sans
                    preset="label"
                    color={preference === item ? theme.ink : theme.ink3}
                    style={styles.segmentText}
                  >
                    {item[0].toUpperCase() + item.slice(1)}
                  </AppText.Sans>
                </TouchableOpacity>
              ))}
            </View>
            <ToggleRow label="Haptics" value={hapticsEnabled} onValueChange={setHapticsEnabled} />
            <ToggleRow label="Anonymous analytics" value={analyticsEnabled} onValueChange={setAnalyticsEnabled} />
          </Section>

          <Section title="About">
            <SettingsRow label="Version" value={`${appVersion} · ${buildNumber}`} />
            <SettingsRow label="Privacy Policy" value="catduel.app" onPress={() => openUrl('https://catduel.app/privacy')} />
            <SettingsRow label="Terms" value="catduel.app" onPress={() => openUrl('https://catduel.app/terms')} />
            <SettingsRow label="Contact" value="support" onPress={() => Linking.openURL('mailto:support@catduel.app')} />
          </Section>

          <View style={styles.actions}>
            <Button label="Sign out" variant="ghost" onPress={confirmSignOut} accessibilityHint="Signs out of this device" />
            <Button
              label="Delete account"
              variant="coral"
              onPress={() => setDeleteVisible(true)}
              accessibilityHint="Opens account deletion confirmation"
            />
          </View>
        </ScrollView>
      </ScreenTransitionView>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay} accessibilityViewIsModal accessibilityLabel="Edit display name">
          <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.modalTitle}>
              Edit display name
            </AppText.Serif>
            <TextInput
              style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg2 }]}
              value={editName}
              onChangeText={setEditName}
              autoCapitalize="words"
              autoFocus
              maxLength={30}
              placeholderTextColor={theme.ink3}
              accessibilityLabel="Display name"
            />
            {editError ? <AppText.Sans preset="small" color={theme.coral}>{editError}</AppText.Sans> : null}
            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={() => setEditVisible(false)} disabled={savingName} style={styles.modalButton} />
              <Button label="Save" onPress={saveDisplayName} loading={savingName} style={styles.modalButton} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteVisible} transparent animationType="fade" onRequestClose={() => setDeleteVisible(false)}>
        <View style={styles.modalOverlay} accessibilityViewIsModal accessibilityLabel="Delete account confirmation">
          <View style={[styles.modalCard, { backgroundColor: theme.bg, borderColor: theme.line }]}>
            <AppText.Serif preset="h1Serif" color={theme.ink} style={styles.modalTitle}>
              Delete account
            </AppText.Serif>
            <AppText.Sans preset="body" color={theme.ink2} style={styles.modalBody}>
              This permanently removes your account and match history. Type DELETE to confirm.
            </AppText.Sans>
            <TextInput
              style={[styles.input, { borderColor: theme.line, color: theme.ink, backgroundColor: theme.bg2 }]}
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              autoCapitalize="characters"
              placeholder="DELETE"
              placeholderTextColor={theme.ink3}
              accessibilityLabel="Delete confirmation"
              accessibilityHint="Type DELETE to confirm permanent account deletion"
            />
            {deleteError ? <AppText.Sans preset="small" color={theme.coral}>{deleteError}</AppText.Sans> : null}
            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={() => setDeleteVisible(false)} disabled={deleting} style={styles.modalButton} />
              <Button label="Delete" variant="coral" onPress={deleteAccount} loading={deleting} style={styles.modalButton} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <AppText.Mono preset="eyebrow" color={theme.ink3} style={styles.sectionTitle}>{title}</AppText.Mono>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

function SettingsRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const { theme } = useTheme();
  const content = (
    <View style={[styles.row, { borderBottomColor: theme.line2 }]}>
      <AppText.Sans preset="bodyMed" color={theme.ink}>{label}</AppText.Sans>
      <View style={styles.rowValue}>
        <AppText.Sans preset="body" color={theme.ink3} numberOfLines={1}>{value}</AppText.Sans>
        {onPress ? <AppText.Sans preset="body" color={theme.ink3}>→</AppText.Sans> : null}
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
    >
      {content}
    </TouchableOpacity>
  );
}

function ToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.line2 }]}>
      <AppText.Sans preset="bodyMed" color={theme.ink}>{label}</AppText.Sans>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        trackColor={{ false: theme.ink4, true: theme.accentSoft }}
        thumbColor={value ? theme.accent : theme.ink3}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 64,
    paddingBottom: 44,
    paddingHorizontal: 20,
    gap: 18,
  },
  header: {
    gap: 8,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    paddingHorizontal: 4,
  },
  sectionCard: {
    paddingVertical: 0,
    paddingHorizontal: 16,
  },
  row: {
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  rowValue: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  segmented: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: 4,
    marginVertical: 12,
    flexDirection: 'row',
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radii.md,
    paddingVertical: 10,
  },
  segmentText: {
    textAlign: 'center',
  },
  actions: {
    gap: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    marginBottom: 2,
  },
  modalBody: {
    marginBottom: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalButton: {
    flex: 1,
  },
});
