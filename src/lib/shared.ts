export const BRAND = '[Community name]';

export const COUNTRIES: [string, string][] = [
  ['Spain', 'ES'], ['Portugal', 'PT'], ['United Kingdom', 'GB'], ['Ireland', 'IE'], ['France', 'FR'],
  ['Italy', 'IT'], ['Germany', 'DE'], ['Austria', 'AT'], ['Netherlands', 'NL'], ['Belgium', 'BE'],
  ['Switzerland', 'CH'], ['Poland', 'PL'], ['United States', 'US'], ['Canada', 'CA'], ['Mexico', 'MX'],
  ['Brazil', 'BR'], ['Argentina', 'AR'], ['Colombia', 'CO'], ['Nigeria', 'NG'], ['Ghana', 'GH'],
  ['Kenya', 'KE'], ['South Africa', 'ZA'], ['Philippines', 'PH'], ['Australia', 'AU'], ['New Zealand', 'NZ'],
];

export const LANGUAGES = [
  'English', 'Spanish', 'Portuguese', 'French', 'Italian', 'German', 'Dutch', 'Polish', 'Irish',
  'Catalan', 'Swahili', 'Yoruba', 'Tagalog', 'Arabic',
];

export const FAITH_OPTIONS = ['[Faith option 1]', '[Faith option 2]', '[Faith option 3]'];

export const FIXED_PROMPTS = [
  'Introduce yourself and where you live',
  'What does your faith mean to you?',
  'What are you hoping to find here?',
];

export const CHOICE_PROMPTS = [
  'What does a good Sunday look like for you?',
  'What are you grateful for this week?',
  'Tell us about your family.',
  'How do you serve in your community?',
  'What are you reading at the moment?',
  'Describe a place where you feel at peace.',
];

export const REPORT_REASONS: [string, string][] = [
  ['fake_profile', 'Fake profile or not the person in the video'],
  ['money', 'Asking for money'],
  ['inappropriate', 'Inappropriate messages'],
  ['other', 'Something else'],
];
export const REPORT_LABEL: Record<string, string> = Object.fromEntries(REPORT_REASONS);
REPORT_LABEL.fake_profile = 'Not the person in the video';

type Items = { photo: 'ok' | 'needs_update'; video: 'ok' | 'needs_update'; details: 'ok' | 'needs_update' };
export const REJECT_REASONS: { code: string; label: string; message: string; items: Items }[] = [
  {
    code: 'photo_dark', label: 'Photo too dark or unclear',
    message: 'Your photo is too dark for us to compare it with your video. Please upload a clear, well-lit photo of your face.',
    items: { photo: 'needs_update', video: 'ok', details: 'ok' },
  },
  {
    code: 'face_video', label: 'Face not clearly visible in video',
    message: "We couldn't see your face clearly in your video. Please record again facing the camera, somewhere well lit.",
    items: { photo: 'ok', video: 'needs_update', details: 'ok' },
  },
  {
    code: 'mismatch', label: "Photo and video don't match",
    message: "We couldn't match the person in your photo with the person in your video. Please upload a recent photo of yourself and record a new video.",
    items: { photo: 'needs_update', video: 'needs_update', details: 'ok' },
  },
  {
    code: 'prompts', label: 'Prompts not answered',
    message: "Your video didn't answer all five prompts. Please record again and answer each one.",
    items: { photo: 'ok', video: 'needs_update', details: 'ok' },
  },
  {
    code: 'language', label: 'Listed language not heard',
    message: "We couldn't hear every language you listed. Please speak a little in each one, or remove a language from your profile.",
    items: { photo: 'ok', video: 'needs_update', details: 'ok' },
  },
  {
    code: 'details', label: 'Profile details incomplete',
    message: 'Some of your profile details are missing or unclear. Please review your answers and resubmit.',
    items: { photo: 'ok', video: 'ok', details: 'needs_update' },
  },
];

const ERRORS: Record<string, string> = {
  under_18: 'You must be 18 or older to join.',
  consent_required: 'Please confirm you are 18 or older and accept the Terms and Privacy Policy.',
  languages_required: 'Please add at least one language you speak.',
  membership_required: 'Starting a conversation needs a membership.',
  already_requested: 'You already have a conversation or request with this member.',
  not_approved: 'Your profile needs to be approved first.',
  not_found: "This member isn't available.",
  media_required: 'Please add a photo and a video.',
  prompts_required: 'Please choose prompts 4 and 5.',
  reason_required: 'Choose a reason before rejecting.',
  founding_full: 'All founding places have been taken.',
  email_taken: 'An account with this email already exists. Try signing in.',
  'Invalid login credentials': 'That email and password don\'t match an account.',
};

export function friendly(err: unknown): string {
  const msg = typeof err === 'string' ? err : (err as { message?: string })?.message ?? 'Something went wrong.';
  for (const [k, v] of Object.entries(ERRORS)) if (msg.includes(k)) return v;
  if (/fetch|network/i.test(msg)) return 'Connection problem. Please try again.';
  return msg;
}

export function ago(iso?: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function waiting(iso?: string | null): string {
  if (!iso) return '';
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h >= 48) return 'Waiting over 48h';
  if (h < 1) return 'waiting under 1h';
  return `waiting ${Math.floor(h)}h`;
}

export function fmtDate(iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', opts);
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return fmtDate(iso, { day: 'numeric', month: 'short' });
}

export function countryName(code?: string | null) {
  if (!code) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function duration(sec?: number | null) {
  if (!sec && sec !== 0) return '';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ageFromDob(dob: string) {
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}
