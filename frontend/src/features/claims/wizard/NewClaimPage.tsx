import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import type { ReactNode } from 'react';
import { useAuth } from '../../../auth/AuthContext';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button } from '../../../components/ui/Button';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { StepNav } from '../../../components/ui/StepNav';
import { CabinetSkeleton } from '../../cabinet/CabinetSkeleton';
import { usePolicies } from '../../cabinet/queries';
import { claimEligibility } from '../claimRules';
import { CLAIM_RULES } from '../claimRules';
import { clearPendingFiles } from '../upload/pendingFiles';
import { useFileQueue } from '../upload/useFileQueue';
import { ClaimWizardContext } from './ClaimWizardContext';
import type { ClaimWizardApi } from './ClaimWizardContext';
import {
  CLAIM_STEPS,
  canVisitClaimStep,
  clearClaimState,
  initialClaimState,
  loadClaimState,
  saveClaimState,
} from './claimWizardState';
import type { ClaimScreen, ClaimWizardState } from './claimWizardState';
import { DamageStep } from './DamageStep';
import { DocumentsStep } from './DocumentsStep';
import { DoneStep } from './DoneStep';
import { IncidentStep } from './IncidentStep';
import { PolicyStep } from './PolicyStep';
import { ReviewStep } from './ReviewStep';

// A client has a handful of policies; one page holds them all.
const POLICY_QUERY = { pageSize: 50, sortBy: 'EndDate', sortDir: 'Desc' } as const;

// /app/claims/new — and ?policy=<id> from a policy's page, which preselects it.
export function NewClaimPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <ClaimWizard userId={user.id} />;
}

function ClaimWizard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const policies = usePolicies(POLICY_QUERY);
  const [state, setState] = useState<ClaimWizardState>(() => {
    const stored = loadClaimState(userId);
    const preselect = params.get('policy');
    // A link from a policy starts a fresh claim for it, unless one is mid-way.
    if (preselect && (!stored || (!stored.claim && stored.step === 'policy')))
      return initialClaimState({ policyId: preselect });
    // A finished claim is not resumed: "File a claim" later starts afresh.
    return stored && stored.step !== 'done' ? stored : initialClaimState();
  });
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const files = useFileQueue({ limit: CLAIM_RULES.maxDocuments, persistKey: `claim.${userId}` });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => saveClaimState(userId, state), [userId, state]);

  // Drop ?policy= once read, so a reload continues instead of restarting.
  useEffect(() => {
    if (params.has('policy')) setParams({}, { replace: true });
  }, [params, setParams]);

  // Each step change puts focus on the step's heading.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [state.step]);

  const list = useMemo(() => policies.data?.items ?? [], [policies.data]);
  const selectedPolicy = list.find((p) => p.id === state.values.policyId);

  // A preselected policy that can't take a claim is not kept as the choice.
  if (
    selectedPolicy &&
    !state.claim &&
    state.step === 'policy' &&
    !claimEligibility(selectedPolicy).eligible
  ) {
    setState((s) => ({ ...s, values: { ...s.values, policyId: '' } }));
  }

  const api = useMemo<ClaimWizardApi>(
    () => ({
      state,
      policies: list,
      selectedPolicy,
      files,
      setValues: (patch) => setState((s) => ({ ...s, values: { ...s.values, ...patch } })),
      goTo: (step: ClaimScreen) => setState((s) => ({ ...s, step })),
      setClaim: (claim) => setState((s) => ({ ...s, claim })),
      serverErrors,
      setServerErrors,
      reset: () => {
        clearClaimState(userId);
        void clearPendingFiles(`claim.${userId}`);
        files.reset();
        setServerErrors({});
        setState(initialClaimState());
      },
    }),
    [state, list, selectedPolicy, files, serverErrors, userId],
  );

  let body: ReactNode;
  if (policies.isPending) body = <CabinetSkeleton />;
  else if (policies.isError)
    body = (
      <ErrorNotice
        error={policies.error}
        action={
          <Button variant="secondary" size="sm" onClick={() => void policies.refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  else {
    const steps: Record<ClaimScreen, ReactNode> = {
      policy: <PolicyStep />,
      incident: <IncidentStep />,
      damage: <DamageStep />,
      documents: <DocumentsStep />,
      review: <ReviewStep />,
      done: <DoneStep />,
    };
    body = steps[state.step];
  }

  return (
    <ClaimWizardContext.Provider value={api}>
      <div className="space-y-8">
        <PageHeader title={t('claimWizard.title')} description={t('claimWizard.lead')} />
        {state.step !== 'done' && (
          <StepNav
            label={t('claimWizard.progress')}
            steps={CLAIM_STEPS.map((id) => ({ id, label: t(`claimWizard.steps.${id}.short`) }))}
            current={state.step}
            canVisit={(step) => canVisitClaimStep(state, step)}
            onSelect={(step) => setState((s) => ({ ...s, step }))}
          />
        )}
        <section aria-labelledby="claim-step-title" className="space-y-8">
          <h2 id="claim-step-title" ref={headingRef} tabIndex={-1} className="text-xl outline-none">
            {t(`claimWizard.steps.${state.step}.title`)}
          </h2>
          {body}
        </section>
      </div>
    </ClaimWizardContext.Provider>
  );
}
