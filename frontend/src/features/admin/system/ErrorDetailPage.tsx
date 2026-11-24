import './systemI18n';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { isApiError } from '../../../api/errors';
import type { ErrorGroupDetail, ErrorOccurrenceResponse, ErrorStatus } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cx } from '../../../components/ui/cx';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { AlertIcon, ArrowLeftIcon, CopyIcon } from '../../../components/ui/icons';
import { ReferenceChip } from '../../../components/ui/ReferenceChip';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/ToastProvider';
import { useFormatters } from '../../../i18n/format';
import { useExclusive, useNow } from '../../../lib/hooks';
import { isConcurrencyConflict } from '../../staff/review/decisionSchema';
import { bugReport } from './bugReport';
import { ErrorStatusBadge, RegressedBadge, SourceBadge } from './ErrorBadges';
import { useErrorGroup, useUpdateErrorStatus } from './queries';
import { relativeTime } from './relativeTime';

const NOTE_MAX = 1000;

// One error group: what it is, how often and where, its triage, and the
// most recent occurrences, each with the Reference a user would quote.
export function ErrorDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const group = useErrorGroup(id);

  const back = (
    <Link
      to="/app/admin/system/errors"
      className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-text"
    >
      <ArrowLeftIcon />
      {t('admin.system.detail.back')}
    </Link>
  );

  if (group.isPending) {
    return (
      <div className="space-y-6">
        {back}
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (group.isError) {
    return (
      <div className="space-y-6">
        {back}
        {isApiError(group.error) && group.error.status === 404 ? (
          <EmptyState headingLevel="h2" title={t('admin.system.detail.notFound')} />
        ) : (
          <ErrorNotice error={group.error} />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-10">
      {back}
      <Detail
        group={group.data}
        highlight={params.get('occurrence')}
        lookedUp={params.get('ref')}
      />
    </div>
  );
}

function Detail({
  group,
  highlight,
  lookedUp,
}: {
  group: ErrorGroupDetail;
  highlight: string | null;
  lookedUp: string | null;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const now = useNow();
  const { toast } = useToast();

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(bugReport(group, t));
      toast({ tone: 'success', title: t('admin.system.detail.copied') });
    } catch {
      toast({ tone: 'error', title: t('admin.system.detail.copyFailed') });
    }
  };

  const when = (iso: string) => (
    <>
      <time dateTime={iso}>{format.dateTime(iso)}</time>{' '}
      <span className="text-paper-muted">({relativeTime(iso, now, t)})</span>
    </>
  );

  return (
    <>
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={group.source} />
          <ErrorStatusBadge status={group.status} />
          {group.isRegressed && <RegressedBadge />}
        </div>
        <h2 className="font-serif text-xl break-words sm:text-2xl">{group.title}</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="sm" onClick={() => void copyReport()}>
            <CopyIcon />
            {t('admin.system.detail.copyReport')}
          </Button>
        </div>
        {lookedUp && (
          <p className="text-sm text-muted">
            {t('admin.system.detail.matched', { code: lookedUp.toUpperCase() })}
          </p>
        )}
        {group.isRegressed && group.regressedAt && (
          <p
            role="note"
            className="flex items-start gap-2 rounded-sm border border-danger/60 px-4 py-3 text-text"
          >
            <span className="mt-0.5 shrink-0 text-danger">
              <AlertIcon />
            </span>
            {t('admin.system.detail.regressedNotice', { time: format.dateTime(group.regressedAt) })}
          </p>
        )}
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card variant="paper" as="section" aria-labelledby="error-facts" className="p-6">
          <h3 id="error-facts" className="mb-4 text-lg">
            {t('admin.system.detail.facts')}
          </h3>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Fact label={t('admin.system.detail.firstSeen')}>{when(group.firstSeenAt)}</Fact>
            <Fact label={t('admin.system.detail.lastSeen')}>{when(group.lastSeenAt)}</Fact>
            <Fact label={t('admin.system.detail.count')}>
              <span className="tabular">{format.integer(group.occurrenceCount)}</span>{' '}
              <span className="text-paper-muted">
                · {t('admin.system.detail.stored', { stored: group.storedOccurrenceCount })}
              </span>
            </Fact>
            <Fact label={t('admin.system.detail.lastStatus')}>{group.lastHttpStatus ?? '—'}</Fact>
            <Fact label={t('admin.system.detail.endpoint')} wide>
              <span className="break-all">{group.endpoint}</span>
            </Fact>
            <Fact label={t('admin.system.detail.type')} wide>
              <span className="break-all">{group.exceptionType}</span>
            </Fact>
            <Fact label={t('admin.system.detail.fingerprint')} wide>
              <span className="font-mono text-sm break-all">{group.fingerprint}</span>
            </Fact>
          </dl>
        </Card>
        <Triage group={group} />
      </div>

      <Occurrences group={group} highlight={highlight} now={now} />
    </>
  );
}

function Fact({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cx('min-w-0 space-y-1', wide && 'sm:col-span-2')}>
      <dt className="text-sm font-medium text-paper-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// Resolve, ignore or reopen, with a note. The version sent is the one shown;
// if the group changed meanwhile (another admin, or it came back) the page
// says so, shows the new state and keeps the note typed.
function Triage({ group }: { group: ErrorGroupDetail }) {
  const { t } = useTranslation();
  const format = useFormatters();
  const { toast } = useToast();
  const update = useUpdateErrorStatus();
  const exclusive = useExclusive();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<ErrorStatus | null>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (conflict) conflictRef.current?.focus();
  }, [conflict]);

  const actions: readonly { status: ErrorStatus; label: string }[] =
    group.status === 'New'
      ? [
          { status: 'Resolved', label: t('admin.system.detail.resolve') },
          { status: 'Ignored', label: t('admin.system.detail.ignore') },
        ]
      : group.status === 'Resolved'
        ? [
            { status: 'New', label: t('admin.system.detail.reopen') },
            { status: 'Ignored', label: t('admin.system.detail.ignore') },
          ]
        : [
            { status: 'New', label: t('admin.system.detail.reopen') },
            { status: 'Resolved', label: t('admin.system.detail.resolve') },
          ];

  const apply = (status: ErrorStatus) =>
    exclusive(async () => {
      if (note.length > NOTE_MAX) return;
      setPending(status);
      setError(null);
      setConflict(false);
      try {
        await update.mutateAsync({
          id: group.id,
          body: {
            status,
            rowVersion: group.rowVersion,
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        });
        setNote('');
        toast({ tone: 'success', title: t('admin.system.detail.saved') });
      } catch (caught) {
        if (isConcurrencyConflict(caught)) setConflict(true);
        else setError(caught);
      } finally {
        setPending(null);
      }
    });

  return (
    <Card as="section" aria-labelledby="error-triage" className="space-y-5 p-6 xl:self-start">
      <h3 id="error-triage" className="text-lg">
        {t('admin.system.detail.triage')}
      </h3>
      <div className="space-y-1">
        <ErrorStatusBadge status={group.status} />
        {group.resolvedByName && group.resolvedAt && (
          <p className="text-sm text-muted">
            {t('admin.system.detail.resolvedBy', {
              status: t(`admin.system.statuses.${group.status}`),
              name: group.resolvedByName,
              time: format.dateTime(group.resolvedAt),
            })}
          </p>
        )}
        {group.note && (
          <blockquote className="mt-2 border-l-2 border-line-strong pl-3 break-words">
            <span className="sr-only">{t('admin.system.detail.note')}: </span>
            {group.note}
          </blockquote>
        )}
      </div>

      {conflict && (
        <div
          ref={conflictRef}
          tabIndex={-1}
          role="alert"
          className="space-y-1 rounded-sm border border-warning/60 px-4 py-3 outline-none"
        >
          <p className="font-medium">{t('admin.system.detail.conflictTitle')}</p>
          <p className="text-sm text-muted">{t('admin.system.detail.conflictBody')}</p>
        </div>
      )}
      {error !== null && <ErrorNotice error={error} />}

      <Textarea
        id={noteId}
        label={t('admin.system.detail.noteLabel')}
        hint={t('admin.system.detail.noteHint')}
        rows={3}
        value={note}
        count={{ value: note.length, max: NOTE_MAX }}
        error={note.length > NOTE_MAX ? 'validation.errorNoteTooLong' : undefined}
        onChange={(event) => setNote(event.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        {actions.map((action, index) => (
          <Button
            key={action.status}
            variant={index === 0 ? 'primary' : 'secondary'}
            loading={pending === action.status}
            disabled={pending !== null && pending !== action.status}
            onClick={() => void apply(action.status)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function Occurrences({
  group,
  highlight,
  now,
}: {
  group: ErrorGroupDetail;
  highlight: string | null;
  now: number;
}) {
  const { t } = useTranslation();
  const marked = useRef<HTMLLIElement>(null);
  // The occurrence a Reference led to: brought into view once.
  useEffect(() => {
    marked.current?.scrollIntoView({ block: 'center' });
  }, [highlight]);

  return (
    <section aria-labelledby="error-occurrences" className="space-y-4">
      <div className="space-y-1">
        <h3 id="error-occurrences" className="text-lg">
          {t('admin.system.detail.occurrences')}
        </h3>
        <p className="text-sm text-muted">{t('admin.system.detail.redacted')}</p>
      </div>
      <ol className="stagger space-y-4">
        {group.occurrences.map((occurrence) => (
          <Occurrence
            key={occurrence.id}
            occurrence={occurrence}
            now={now}
            marked={occurrence.id === highlight}
            itemRef={occurrence.id === highlight ? marked : undefined}
          />
        ))}
      </ol>
    </section>
  );
}

function Occurrence({
  occurrence,
  now,
  marked,
  itemRef,
}: {
  occurrence: ErrorOccurrenceResponse;
  now: number;
  marked: boolean;
  itemRef?: React.RefObject<HTMLLIElement | null> | undefined;
}) {
  const { t } = useTranslation();
  const format = useFormatters();
  const facts: [string, string | number | null][] = [
    [t('admin.system.detail.status'), occurrence.httpStatus],
    [
      t('admin.system.detail.route'),
      occurrence.httpMethod || occurrence.routeTemplate
        ? `${occurrence.httpMethod ?? ''} ${occurrence.routeTemplate ?? ''}`.trim()
        : null,
    ],
    [t('admin.system.detail.page'), occurrence.clientRoute],
    [
      t('admin.system.detail.role'),
      occurrence.actorRole
        ? t(`roles.${occurrence.actorRole}`)
        : t('admin.system.detail.signedOut'),
    ],
    [t('admin.system.detail.version'), occurrence.appVersion],
    [t('admin.system.detail.environment'), occurrence.environment],
    [t('admin.system.detail.browser'), occurrence.userAgentFamily],
  ];

  return (
    <li
      ref={itemRef}
      data-testid="error-occurrence"
      className={cx(
        'space-y-3 rounded-sm border p-4',
        marked ? 'border-accent bg-surface-2' : 'border-line',
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <ReferenceChip traceId={occurrence.traceId} />
        <span className="text-sm text-muted">
          <time dateTime={occurrence.occurredAt}>{format.dateTime(occurrence.occurredAt)}</time> ·{' '}
          {relativeTime(occurrence.occurredAt, now, t)}
        </span>
        {marked && (
          <span className="text-sm font-medium text-accent">
            {t('admin.system.detail.thisOne')}
          </span>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {facts
          .filter(([, value]) => value !== null && value !== '')
          .map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
      </dl>
      <div className="space-y-1">
        <p className="text-sm text-muted">{t('admin.system.detail.message')}</p>
        <p className="break-words">{occurrence.message}</p>
      </div>
      {occurrence.stackTrace ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted hover:text-text">
            {t('admin.system.detail.stack')}
          </summary>
          {/* A long stack scrolls inside its box, so the box takes focus:
              arrow keys scroll it without a mouse. */}
          <pre
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label={t('admin.system.detail.stack')}
            className="focus-ring mt-2 max-h-96 overflow-y-auto rounded-sm border border-line bg-surface p-3 font-mono text-sm leading-6 break-words whitespace-pre-wrap"
          >
            {occurrence.stackTrace}
          </pre>
        </details>
      ) : (
        <p className="text-sm text-muted">{t('admin.system.detail.noStack')}</p>
      )}
    </li>
  );
}
