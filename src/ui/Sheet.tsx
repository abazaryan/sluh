import { useId, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
}

/** Bottom sheet dialog, as in the prototype. */
export function Sheet({ title, onClose, children }: Props) {
  const id = useId();
  return (
    <div className="sheet">
      <div className="sheet-body" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button className="ghost" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
