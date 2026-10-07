import { appendCapped, isLogEntry, type LogEntry } from '../core/log';
import { sanitizeSettings, type Settings } from '../core/settings';

// Same keys as the prototype, so its settings and journal carry over
// when the app is opened on the same address.
const SETTINGS_KEY = 'sluh.settings';
const LOG_KEY = 'sluh.log';

function read(key: string): unknown {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  return sanitizeSettings(read(SETTINGS_KEY));
}

export function saveSettings(s: Settings): boolean {
  return write(SETTINGS_KEY, s);
}

export function loadLog(): LogEntry[] {
  const v = read(LOG_KEY);
  return Array.isArray(v) ? v.filter(isLogEntry) : [];
}

export function appendLogEntry(entry: LogEntry): void {
  write(LOG_KEY, appendCapped(loadLog(), entry));
}

export function clearLog(): void {
  write(LOG_KEY, []);
}
