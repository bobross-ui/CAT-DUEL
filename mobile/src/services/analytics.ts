type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsProperties = Record<string, AnalyticsValue>;

const BLOCKED_PROPERTY_KEYS = new Set([
  'email',
  'displayName',
  'firebaseUid',
  'path',
  'questionText',
  'answerText',
  'selectedAnswerText',
]);

let enabled = true;
let identifiedUserId: string | null = null;

function sanitizeProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (value === undefined) return false;
      if (BLOCKED_PROPERTY_KEYS.has(key)) return false;
      if (key.toLowerCase().includes('userid')) return false;
      return true;
    }),
  );
}

export function init() {
  // Provider setup lives here once PostHog is approved as a dependency.
}

export function setEnabled(nextEnabled: boolean) {
  enabled = nextEnabled;
  if (!nextEnabled) identifiedUserId = null;
}

export function identify(userId: string, properties: AnalyticsProperties = {}) {
  if (!enabled) return;
  identifiedUserId = userId;

  if (__DEV__) {
    console.log('[analytics:identify]', userId, sanitizeProperties(properties));
  }
}

export function reset() {
  identifiedUserId = null;

  if (__DEV__) {
    console.log('[analytics:reset]');
  }
}

export function track(event: string, properties: AnalyticsProperties = {}) {
  if (!enabled) return;

  const sanitized = sanitizeProperties(properties);

  if (__DEV__) {
    console.log('[analytics]', event, {
      ...(identifiedUserId ? { identified: true } : {}),
      ...sanitized,
    });
  }
}
