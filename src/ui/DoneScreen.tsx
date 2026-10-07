import { fmtSec } from '../core/format';
import { GRADE_NAMES, type Grade } from '../core/grade';
import { summarize, type LogEntry } from '../core/log';

interface Props {
  session: LogEntry[];
  onAgain(): void;
  onOpenLog(): void;
}

const GRADES: Grade[] = [1, 2, 3, 4];

export function DoneScreen({ session, onAgain, onOpenLog }: Props) {
  const s = summarize(session);
  return (
    <section>
      <h1>Серия окончена</h1>
      <div className="sum">
        {GRADES.map((g) => (
          <div key={g}>
            <strong>{s.counts[g]}</strong>
            <span>{GRADE_NAMES[g]}</span>
          </div>
        ))}
      </div>
      <p className="lead">
        {s.answered
          ? `Средняя точность — ${Math.round(s.avgScore * 100)}%, среднее время до начала ответа — ${fmtSec(s.avgLatencyMs)}. Откройте журнал, скопируйте его и пришлите.`
          : 'Нет данных.'}
      </p>
      <div className="row">
        <button className="secondary" type="button" onClick={onAgain}>
          Ещё раз
        </button>
        <button className="primary" type="button" onClick={onOpenLog}>
          Открыть журнал
        </button>
      </div>
    </section>
  );
}
