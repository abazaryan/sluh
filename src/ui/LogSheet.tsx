import { useEffect, useRef, useState } from 'react';
import { fmtSec } from '../core/format';
import { GRADE_NAMES } from '../core/grade';
import { clearLog, loadLog } from '../platform/storage';
import { copyText } from '../platform/device';
import { Sheet } from './Sheet';

interface Props {
  onClose(): void;
}

const SHOWN = 40;

export function LogSheet({ onClose }: Props) {
  const [log, setLog] = useState(loadLog);
  const [msg, setMsg] = useState<string | null>(null);
  const [fallbackText, setFallbackText] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (fallbackText !== null) {
      boxRef.current?.focus();
      boxRef.current?.select();
    }
  }, [fallbackText]);

  const copy = async () => {
    const text = JSON.stringify(log, null, 1);
    if (await copyText(text)) {
      setFallbackText(null);
      setMsg(`Скопировано: ${log.length} записей.`);
    } else {
      setFallbackText(text);
      setMsg('Выделите текст ниже и скопируйте его вручную.');
    }
  };

  const clear = () => {
    clearLog();
    setLog([]);
    setFallbackText(null);
    setMsg(null);
  };

  const status = msg ?? (log.length ? `Записей: ${log.length}` : 'Пока пусто. Пройдите хотя бы несколько карточек.');

  return (
    <Sheet title="Журнал ответов" onClose={onClose}>
      <div className="row start">
        <button className="primary" type="button" onClick={() => void copy()}>
          Скопировать всё
        </button>
        <button className="secondary" type="button" onClick={clear}>
          Очистить
        </button>
      </div>
      <p className="hint" role="status">
        {status}
      </p>
      {fallbackText !== null && <textarea ref={boxRef} className="logbox" readOnly value={fallbackText} />}
      <div>
        {log
          .slice()
          .reverse()
          .slice(0, SHOWN)
          .map((e, i) => (
            <div key={`${e.ts}-${i}`} className="logitem">
              <div>
                <b>{e.expected}</b>
              </div>
              <div className="m">
                {e.heard ? `«${e.heard}»` : 'без ответа'} · {Math.round(e.score * 100)}% · {fmtSec(e.latencyMs)} ·{' '}
                {GRADE_NAMES[e.suggested]}
                {e.suggested !== e.final ? ` → ${GRADE_NAMES[e.final]}` : ''}
              </div>
            </div>
          ))}
      </div>
    </Sheet>
  );
}
