import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Settings } from '../core/settings';
import { Trainer } from '../core/trainer';
import { browserClock } from '../platform/device';
import { createBrowserRecognizer, createBrowserSpeaker } from '../platform/speech';
import { appendLogEntry, loadSettings, saveSettings } from '../platform/storage';
import { CardScreen } from './CardScreen';
import { DoneScreen } from './DoneScreen';
import { LogSheet } from './LogSheet';
import { SettingsSheet } from './SettingsSheet';
import { StartScreen } from './StartScreen';

type Sheet = 'settings' | 'log' | null;

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const [trainer] = useState(
    () =>
      new Trainer({
        recognizer: createBrowserRecognizer(),
        speaker: createBrowserSpeaker(),
        clock: browserClock,
        getSettings: () => settingsRef.current,
        appendLog: appendLogEntry,
      }),
  );
  const state = useSyncExternalStore(trainer.subscribe, trainer.getState);
  const [sheet, setSheet] = useState<Sheet>(null);

  useEffect(() => () => trainer.dispose(), [trainer]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state.phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const applySettings = (s: Settings) => {
    saveSettings(s);
    settingsRef.current = s;
    setSettings(s);
    setSheet(null);
  };

  return (
    <>
      <main id="app">
        <header className="top">
          <div className="brand">Слух</div>
          <div className="top-actions">
            <button className="ghost" type="button" onClick={() => setSheet('log')}>
              Журнал
            </button>
            <button className="ghost" type="button" onClick={() => setSheet('settings')}>
              Настройки
            </button>
          </div>
        </header>

        {state.phase === 'start' && <StartScreen deckText={settings.deck} onStart={() => trainer.start()} />}
        {state.phase === 'card' && <CardScreen state={state} trainer={trainer} />}
        {state.phase === 'done' && (
          <DoneScreen session={state.session} onAgain={() => trainer.start()} onOpenLog={() => setSheet('log')} />
        )}
      </main>

      {sheet === 'settings' && (
        <SettingsSheet settings={settings} onSave={applySettings} onClose={() => setSheet(null)} />
      )}
      {sheet === 'log' && <LogSheet onClose={() => setSheet(null)} />}
    </>
  );
}
