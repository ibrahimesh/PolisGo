import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router';
import { policiesApi } from '../../api/endpoints';
import { isApiError } from '../../api/errors';
import type { PolicyDetailResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/layout/PageHeader';
import { ButtonLink } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorNotice } from '../../components/ui/ErrorNotice';
import { todayIso } from '../../lib/dates';
import { CabinetSkeleton } from '../cabinet/CabinetSkeleton';
import { cabinetKeys, useInvalidateCabinet, useVehicles } from '../cabinet/queries';
import { addDays, termMonths } from '../policies/policyDates';
import { CoverStep } from './CoverStep';
import { DoneStep } from './DoneStep';
import { PaymentStep } from './PaymentStep';
import { ReviewStep } from './ReviewStep';
import { Stepper } from './Stepper';
import { VehicleStep } from './VehicleStep';
import { WizardContext } from './WizardContext';
import type { WizardApi } from './WizardContext';
import { clearState, initialState, loadState, saveState, valuesKey } from './wizardState';
import type { StepId, WizardState } from './wizardState';

// /app/buy — and two entry points into it:
//   ?renew=<policyId>  starts a purchase for the same vehicle and cover,
//                      beginning the day after the old policy ends;
//   ?draft=<policyId>  resumes an unpaid draft at the payment step.
export function BuyPolicyPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const renew = params.get('renew');
  const draft = params.get('draft');
  if (!user) return null;

  if (renew || draft) {
    return (
      <Prefill
        userId={user.id}
        policyId={(renew ?? draft) as string}
        mode={renew ? 'renew' : 'draft'}
      />
    );
  }
  return <Wizard userId={user.id} />;
}

function Prefill({
  userId,
  policyId,
  mode,
}: {
  userId: string;
  policyId: string;
  mode: 'renew' | 'draft';
}) {
  const { t } = useTranslation();
  const [, setParams] = useSearchParams();
  const policy = useQuery({
    queryKey: cabinetKeys.policy(policyId),
    queryFn: ({ signal }) => policiesApi.get(policyId, signal),
  });

  const target = useMemo(
    () => (policy.data ? prefillState(policy.data, mode) : null),
    [policy.data, mode],
  );

  useEffect(() => {
    if (!target) return;
    saveState(userId, target);
    // Drop the parameter so a reload continues the wizard instead of
    // re-applying the prefill over the user's later answers.
    setParams({}, { replace: true });
  }, [target, userId, setParams]);

  if (policy.isError) {
    return isApiError(policy.error) && policy.error.status === 404 ? (
      <EmptyState
        headingLevel="h1"
        title={t('policy.notFoundTitle')}
        body={t('policy.notFoundBody')}
        action={<ButtonLink to="/app/buy">{t('wizard.startFresh')}</ButtonLink>}
      />
    ) : (
      <ErrorNotice error={policy.error} />
    );
  }
  // A draft that can't be paid any more goes to its page, which says why.
  if (policy.data && !target) return <Navigate to={`/app/policies/${policyId}`} replace />;
  return <CabinetSkeleton />;
}

function prefillState(detail: PolicyDetailResponse, mode: 'renew' | 'draft'): WizardState | null {
  const { policy } = detail;
  const values = {
    policyTypeCode: policy.policyTypeCode,
    vehicleId: policy.vehicleId,
    termMonths: termMonths(policy.startDate, policy.endDate),
    startDate: policy.startDate,
  };
  if (mode === 'draft') {
    if (policy.status !== 'Draft' || policy.startDate < todayIso()) return null;
    return {
      ...initialState(values),
      step: 'payment',
      draft: {
        id: policy.id,
        policyNumber: policy.policyNumber,
        premium: policy.premium,
        currency: policy.currency,
        valuesKey: valuesKey(values),
      },
    };
  }
  // Renewal: same car and cover, starting the day after the old one ends.
  const nextDay = addDays(policy.endDate, 1);
  return initialState({ ...values, startDate: nextDay > todayIso() ? nextDay : todayIso() });
}

function Wizard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateCabinet();
  const vehicles = useVehicles();
  const [state, setState] = useState<WizardState>(() => loadState(userId) ?? initialState());
  const [navigating, setNavigating] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => saveState(userId, state), [userId, state]);

  // Preselect the only (or first) vehicle so the price shows from step one.
  const firstVehicle = vehicles.data?.[0]?.id;
  // (Adjusted during render, React's pattern for state derived from data.)
  if (firstVehicle && !state.values.vehicleId && state.step === 'cover') {
    setState((s) => ({ ...s, values: { ...s.values, vehicleId: firstVehicle } }));
  }

  // Each step change puts focus on the step's heading, so keyboard and
  // screen-reader users start at the top of the new step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [state.step]);

  const goTo = useCallback(
    async (step: StepId) => {
      const draft = state.draft;
      if (draft && (step === 'cover' || step === 'vehicle')) {
        setNavigating(true);
        try {
          await policiesApi.cancel(draft.id);
        } catch {
          // Already paid or cancelled elsewhere: nothing left to replace.
        } finally {
          setNavigating(false);
        }
        void invalidate();
        setState((s) => ({ ...s, step, draft: null }));
        return;
      }
      setState((s) => ({ ...s, step }));
    },
    [state.draft, invalidate],
  );

  const api = useMemo<WizardApi>(
    () => ({
      state,
      navigating,
      goTo,
      setValues: (patch) => setState((s) => ({ ...s, values: { ...s.values, ...patch } })),
      setDraft: (draft) => setState((s) => ({ ...s, draft })),
      complete: (receipt) => setState((s) => ({ ...s, receipt, step: 'done' })),
      reset: () => {
        clearState(userId);
        setState(initialState());
      },
    }),
    [state, navigating, goTo, userId],
  );

  const steps: Record<StepId, React.ReactNode> = {
    cover: <CoverStep />,
    vehicle: <VehicleStep />,
    review: <ReviewStep />,
    payment: <PaymentStep />,
    done: <DoneStep />,
  };

  return (
    <WizardContext.Provider value={api}>
      <div className="space-y-8">
        <PageHeader title={t('wizard.title')} description={t('wizard.lead')} />
        <Stepper />
        <section aria-labelledby="wizard-step-title" className="space-y-8">
          <h2
            id="wizard-step-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl outline-none"
          >
            {t(`wizard.steps.${state.step}.title`)}
          </h2>
          {steps[state.step]}
        </section>
      </div>
    </WizardContext.Provider>
  );
}
