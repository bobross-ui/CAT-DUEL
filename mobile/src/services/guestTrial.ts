import { getStoredValue, setStoredValue } from './storage';

const GUEST_TRIAL_USED_KEY = 'cat_duel_guest_trial_used';

export async function hasUsedGuestTrial() {
  return (await getStoredValue(GUEST_TRIAL_USED_KEY)) === 'true';
}

export async function markGuestTrialUsed() {
  await setStoredValue(GUEST_TRIAL_USED_KEY, 'true');
}

export function guestTrialUsedError() {
  return Object.assign(new Error('Guest trial already used.'), { code: 'GUEST_TRIAL_USED' });
}
