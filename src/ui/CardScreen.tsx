import { useEffect, useRef, useState } from 'react';
import type { AlignOp } from '../core/compare';
import { fmtSec } from '../core/format';
import { GRADE_NAMES, type Grade } from '../core/grade';
import type { Trainer, TrainerState } from '../core/trainer';

interface Props {
  state: TrainerState;
  trainer: Trainer;
}

const GRADES: Grade[] = [1, 2, 3, 4];

function HeardWords({ ops }: { ops: AlignOp[] }) {
  return (
    <>
      {ops.map((op, i) => {
        switch (op.t) {
          case 'ok':
            return (
              <span key={i} className="ok">
                {op.h.w}{' '}
              </span>
            );
          case 'sub':
          case 'extra':
            return (
              <span key={i} className="bad">
                {op.h.w}{' '}
              </span>
            );
          case 'miss':
            return (
              <span key={i}>
                <span className="miss">[{op.e.w}]</span>{' '}
              </span>
            );
        }
      })}
    </>
  );
}

export function CardScreen({ state, trainer }: Props) {
  const { card, progress, mic, result } = state;
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Fresh input for every card.
  useEffect(() => setTyped(''), [state.cardSeq]);

  useEffect(() => {
    if (state.typedMode) inputRef.current?.focus();
  }, [state.typedMode, state.cardSeq]);

  if (!card) return null;

  const submit = () => trainer.submitTyped(typed);

  return (
    <section>
      <div className="progress">
        <span>
          {progress.position} из {progress.total}
        </span>
        <div className="bar">
          <i style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
        </div>
      </div>
      <div className="prompt">{card.ru}</div>

      {!result && (
        <div className="listen">
          <div className="mic" data-state={mic.state}>
            <span className="ring" />
            <span className="dot" />
          </div>
          <div className={'status' + (mic.error ? ' err' : '')} role="status">
            {mic.message}
          </div>
          <div className="live" lang="fr">
            {state.live}
          </div>
          <div className="row">
            {state.showRetry && (
              <button className="secondary" type="button" onClick={() => trainer.retry()}>
                Повторить
              </button>
            )}
            <button className="ghost" type="button" onClick={() => trainer.skip()}>
              Не знаю
            </button>
            <button className="ghost" type="button" onClick={() => trainer.toggleTyped()}>
              {state.typedMode ? 'Ответить голосом' : 'Ответить текстом'}
            </button>
          </div>
          {state.typedMode && (
            <div className="typebox">
              <input
                ref={inputRef}
                type="text"
                lang="fr"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Ответ по-французски"
                value={typed}
                onChange={(e) => {
                  trainer.markTyping();
                  setTyped(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button className="primary" type="button" onClick={submit}>
                Проверить
              </button>
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="result">
          <p className="answer" lang="fr">
            {card.fr}
          </p>
          <p className="heard" lang="fr">
            {result.skipped ? (
              <span className="lbl">Вы не ответили.</span>
            ) : (
              <>
                <span className="lbl">Вы сказали:</span>
                <HeardWords ops={result.ops} />
              </>
            )}
          </p>
          <dl className="metrics">
            <div>
              <dt>Точность</dt>
              <dd>{result.skipped ? '—' : `${Math.round(result.score * 100)}%`}</dd>
            </div>
            <div>
              <dt>Начало ответа</dt>
              <dd>{result.skipped ? '—' : fmtSec(result.latencyMs)}</dd>
            </div>
            <div>
              <dt>Всего</dt>
              <dd>{fmtSec(result.totalMs)}</dd>
            </div>
          </dl>
          <p className="reason">
            Предложено: {GRADE_NAMES[result.suggestion.grade]} — {result.suggestion.reason}.
          </p>
          <div className="grades" role="group" aria-label="Оценка карточки">
            {GRADES.map((g) => (
              <button
                key={g}
                className="grade"
                data-g={g}
                type="button"
                aria-pressed={state.selected === g}
                onClick={() => trainer.selectGrade(g)}
              >
                {GRADE_NAMES[g]}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="secondary" type="button" onClick={() => trainer.speakReference()}>
              Послушать
            </button>
            <button className="primary" type="button" onClick={() => trainer.next()}>
              Дальше
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
