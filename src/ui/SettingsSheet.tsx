import { useState } from 'react';
import { DEFAULT_DECK_TEXT } from '../core/deck';
import { LANGS, sanitizeSettings, type Settings } from '../core/settings';
import { Sheet } from './Sheet';

interface Props {
  settings: Settings;
  onSave(s: Settings): void;
  onClose(): void;
}

export function SettingsSheet({ settings, onSave, onClose }: Props) {
  const [lang, setLang] = useState(settings.lang);
  const [easy, setEasy] = useState(String(settings.easy));
  const [good, setGood] = useState(String(settings.good));
  const [again, setAgain] = useState(String(settings.again));
  const [hard, setHard] = useState(String(settings.hard));
  const [lenient, setLenient] = useState(settings.lenient);
  const [autoSpeak, setAutoSpeak] = useState(settings.autoSpeak);
  const [deck, setDeck] = useState(settings.deck);

  const save = () => onSave(sanitizeSettings({ lang, easy, good, again, hard, lenient, autoSpeak, deck }, settings));

  return (
    <Sheet title="Настройки" onClose={onClose}>
      <label className="field">
        <span>Язык распознавания</span>
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <div className="two">
        <label className="field">
          <span>«Легко», если начали за (с)</span>
          <input type="number" min="0.5" max="30" step="0.5" value={easy} onChange={(e) => setEasy(e.target.value)} />
        </label>
        <label className="field">
          <span>«Хорошо», если начали за (с)</span>
          <input type="number" min="1" max="60" step="0.5" value={good} onChange={(e) => setGood(e.target.value)} />
        </label>
        <label className="field">
          <span>«Снова», если точность ниже (%)</span>
          <input type="number" min="10" max="95" step="5" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <label className="field">
          <span>Не выше «Трудно», если ниже (%)</span>
          <input type="number" min="20" max="100" step="5" value={hard} onChange={(e) => setHard(e.target.value)} />
        </label>
      </div>
      <p className="hint">
        Пороги времени заданы для фразы из 4 слов; на каждое слово сверх этого добавляется 0,3 с. Начальные значения —
        предположение, их нужно подобрать по вашему журналу.
      </p>
      <label className="check">
        <input type="checkbox" checked={lenient} onChange={(e) => setLenient(e.target.checked)} />
        <span>Не различать é / è / ê и другие акценты при сверке</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />
        <span>Проигрывать эталон после ответа</span>
      </label>
      <label className="field">
        <span>Колода: по строке на карточку, «по-русски | по-французски»</span>
        <textarea spellCheck={false} value={deck} onChange={(e) => setDeck(e.target.value)} />
      </label>
      <div className="row">
        <button className="secondary" type="button" onClick={() => setDeck(DEFAULT_DECK_TEXT)}>
          Вернуть примеры
        </button>
        <button className="primary" type="button" onClick={save}>
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}
