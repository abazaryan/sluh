import type { Clock } from '../core/ports';
import { countFrenchVoices, isRecognitionSupported } from './speech';

export const browserClock: Clock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
};

export type MicPermission = 'granted' | 'denied' | 'prompt' | null;

export interface Diagnostics {
  recognition: boolean;
  secure: boolean;
  frenchVoices: number;
  framed: boolean;
  /** Permissions-Policy verdict for the microphone, null if the browser can't tell. */
  micAllowedByPolicy: boolean | null;
}

export function getDiagnostics(): Diagnostics {
  let framed = false;
  try {
    framed = window.top !== window.self;
  } catch {
    framed = true;
  }
  let micAllowedByPolicy: boolean | null = null;
  try {
    const d = document as unknown as {
      permissionsPolicy?: { allowsFeature(f: string): boolean };
      featurePolicy?: { allowsFeature(f: string): boolean };
    };
    const fp = d.permissionsPolicy ?? d.featurePolicy;
    if (fp?.allowsFeature) micAllowedByPolicy = fp.allowsFeature('microphone');
  } catch {
    /* unknown */
  }
  return {
    recognition: isRecognitionSupported(),
    secure: window.isSecureContext,
    frenchVoices: countFrenchVoices(),
    framed,
    micAllowedByPolicy,
  };
}

export async function queryMicPermission(): Promise<MicPermission> {
  try {
    if (!navigator.permissions?.query) return null;
    const r = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return r.state;
  } catch {
    return null;
  }
}

export type MicTestResult = { ok: true } | { ok: false; message: string };

/** Opens the microphone once and releases it immediately. */
export async function testMicrophone(): Promise<MicTestResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, message: 'На этой странице браузер не даёт доступа к микрофону.' };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    const err = e as { name?: string; message?: string } | null;
    const name = err?.name || 'ошибка';
    const msg = err?.message ? ` (${err.message})` : '';
    return { ok: false, message: `Микрофон недоступен: ${name}${msg}` };
  }
}

/** Copies text; resolves false if the clipboard is unavailable or refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
