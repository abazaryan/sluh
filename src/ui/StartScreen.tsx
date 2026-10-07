import { useCallback, useEffect, useState } from 'react';
import { parseDeck } from '../core/deck';
import { pluralRu } from '../core/format';
import { getDiagnostics, queryMicPermission, testMicrophone, type MicPermission } from '../platform/device';
import { onVoicesChanged } from '../platform/speech';

interface Props {
  deckText: string;
  onStart(): void;
}

function DiagRow({ k, v, cls }: { k: string; v: string; cls?: 'ok' | 'bad' | '' }) {
  return (
    <div>
      <span className="k">{k}</span>
      <span className={'v ' + (cls ?? '')}>{v}</span>
    </div>
  );
}

const PERMISSION_TEXT: Record<string, string> = { granted: 'разрешён', denied: 'запрещён', prompt: 'спросит' };

export function StartScreen({ deckText, onStart }: Props) {
  const [diag, setDiag] = useState(getDiagnostics);
  const [perm, setPerm] = useState<MicPermission>(null);
  const [micMsg, setMicMsg] = useState<{ text: string; err: boolean }>({ text: '', err: false });

  const refresh = useCallback(() => {
    setDiag(getDiagnostics());
    void queryMicPermission().then(setPerm);
  }, []);

  useEffect(() => {
    refresh();
    return onVoicesChanged(refresh);
  }, [refresh]);

  const runMicTest = async () => {
    setMicMsg({ text: 'Проверяю…', err: false });
    const r = await testMicrophone();
    setMicMsg(r.ok ? { text: 'Микрофон работает. Можно начинать.', err: false } : { text: r.message, err: true });
    refresh();
  };

  const n = parseDeck(deckText).length;

  return (
    <section>
      <h1>Отвечайте вслух</h1>
      <p className="lead">
        Вы видите фразу по-русски и произносите перевод по-французски. Приложение слушает, сверяет ответ с эталоном и
        предлагает оценку по точности и скорости.
      </p>
      <div className="diag" aria-live="polite">
        <DiagRow k="Распознавание речи" v={diag.recognition ? 'есть' : 'нет'} cls={diag.recognition ? 'ok' : 'bad'} />
        <DiagRow k="Защищённое соединение" v={diag.secure ? 'да' : 'нет'} cls={diag.secure ? 'ok' : 'bad'} />
        <DiagRow
          k="Французские голоса для озвучки"
          v={diag.frenchVoices ? String(diag.frenchVoices) : 'не найдены'}
          cls={diag.frenchVoices ? 'ok' : ''}
        />
        <DiagRow k="Страница во встроенном окне" v={diag.framed ? 'да' : 'нет'} cls={diag.framed ? '' : 'ok'} />
        {diag.micAllowedByPolicy !== null && (
          <DiagRow
            k="Микрофон разрешён в этом окне"
            v={diag.micAllowedByPolicy ? 'да' : 'нет'}
            cls={diag.micAllowedByPolicy ? 'ok' : 'bad'}
          />
        )}
        {perm && (
          <DiagRow
            k="Доступ к микрофону"
            v={PERMISSION_TEXT[perm] ?? perm}
            cls={perm === 'granted' ? 'ok' : perm === 'denied' ? 'bad' : ''}
          />
        )}
        {!diag.recognition ? (
          <p>Этот браузер не поддерживает распознавание речи. Используйте Chrome или Edge, либо отвечайте текстом.</p>
        ) : diag.framed ? (
          <p>
            Если микрофон не включится, откройте страницу по ссылке в отдельной вкладке браузера: во встроенном окне
            доступ к микрофону может быть заблокирован.
          </p>
        ) : null}
      </div>
      <button className="secondary big mictest" type="button" onClick={() => void runMicTest()}>
        Проверить микрофон
      </button>
      <p className={'hint' + (micMsg.err ? ' err' : '')} role="status">
        {micMsg.text}
      </p>
      <button className="primary big mt" type="button" onClick={onStart}>
        Начать ({n} {pluralRu(n, 'карточка', 'карточки', 'карточек')})
      </button>
      <p className="note">
        Это проверочная версия: она нужна, чтобы выяснить, насколько хорошо браузер понимает ваш французский. После
        серии карточек откройте «Журнал», нажмите «Скопировать всё» и пришлите содержимое — по нему будут подобраны
        пороги оценок.
      </p>
    </section>
  );
}
