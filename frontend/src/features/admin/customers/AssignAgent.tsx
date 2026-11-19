import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { customersApi } from '../../../api/endpoints';
import type { CustomerDetailResponse } from '../../../api/types';
import { Button } from '../../../components/ui/Button';
import { ErrorNotice } from '../../../components/ui/ErrorNotice';
import { useToast } from '../../../components/ui/ToastProvider';
import { firstFieldMessageKey } from '../../../i18n/apiErrors';
import { useExclusive } from '../../../lib/hooks';
import { useInvalidateCabinet } from '../../cabinet/queries';
import { StaffPicker } from '../StaffPicker';

// Admins hand a customer to an agent (or release them): the agent then sees
// them in their book and can sell to them. Recorded in the audit log.
export function AssignAgent({ customer }: { customer: CustomerDetailResponse }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateCabinet();
  const exclusive = useExclusive();
  const [agentId, setAgentId] = useState(customer.agentId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const unchanged = agentId === (customer.agentId ?? '');

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    void exclusive(async () => {
      setBusy(true);
      setError(null);
      try {
        await customersApi.assignAgent(customer.id, agentId || null);
        await invalidate();
        // The saved record names the agent, whichever page of the picker they were on.
        const name = (await customersApi.get(customer.id)).agentName;
        toast.toast({
          tone: 'success',
          title: name
            ? t('admin.customers.assignedToast', { customer: customer.fullName, agent: name })
            : t('admin.customers.releasedToast', { customer: customer.fullName }),
        });
      } catch (caught) {
        setError(caught);
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <section aria-labelledby="assign-agent-title" className="space-y-4">
      <h2 id="assign-agent-title" className="text-2xl">
        {t('admin.customers.assignTitle')}
      </h2>
      <p className="text-muted">{t('admin.customers.assignHelp')}</p>
      <form noValidate onSubmit={submit} className="space-y-4">
        {error !== null && (
          <ErrorNotice error={error} overrides={{ 400: firstFieldMessageKey(error) }} />
        )}
        <StaffPicker
          label={t('admin.customers.agent')}
          staffRole="Agent"
          status="Active"
          value={agentId}
          onChange={setAgentId}
          emptyOption={{ value: '', label: t('admin.customers.unassigned') }}
          selectedLabel={
            agentId === customer.agentId ? (customer.agentName ?? undefined) : undefined
          }
        />
        <Button type="submit" variant="secondary" loading={busy} disabled={unchanged}>
          {t('admin.customers.save')}
        </Button>
      </form>
    </section>
  );
}
