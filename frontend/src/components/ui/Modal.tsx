import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from './cx';
import { CloseIcon } from './icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  // A document preview needs the room; dialogs stay narrow.
  size?: 'default' | 'wide';
}

// Native <dialog> gives a real focus trap, inert background, Esc to close and
// focus return to the opener — no hand-rolled focus management needed.
export function Modal({ open, onClose, title, children, footer, size = 'default' }: ModalProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The onClick closes on a backdrop click (target is the <dialog> itself, not
  // the panel). It's a mouse-only convenience: keyboard users already have Esc
  // and the close button, so the a11y key-handler rules don't apply.
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={cx(
        'm-auto dialog-in rounded-sm border border-line bg-surface p-0 text-text shadow-[0_24px_64px_-24px_rgb(0_0_0/0.6)] backdrop:bg-overlay',
        size === 'wide' ? 'w-[min(64rem,calc(100vw-2rem))]' : 'w-[min(36rem,calc(100vw-2rem))]',
      )}
    >
      <div className="flex items-start justify-between gap-6 border-b border-line px-6 py-5">
        <h2 id={titleId} className="text-xl">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="-mr-2 grid size-9 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-text"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="space-y-4 px-6 py-6 leading-relaxed text-muted">{children}</div>
      {footer && (
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">{footer}</div>
      )}
    </dialog>
  );
}
