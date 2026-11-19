import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffRole, StaffStatusFilter } from '../../api/types';
import { SearchIcon } from '../../components/ui/icons';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useDebouncedValue } from '../../lib/hooks';
import { useStaffOptions } from './queries';

// Choosing a staff member from a team of any size: a search box narrows the
// list the server returns (50 at most), and the select picks from it. The
// current choice stays listed even when the search no longer finds it.
export function StaffPicker({
  label,
  value,
  onChange,
  staffRole,
  status = 'All',
  emptyOption,
  extraOptions = [],
  selectedLabel,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  staffRole?: StaffRole;
  status?: StaffStatusFilter;
  emptyOption: { value: string; label: string };
  extraOptions?: readonly { value: string; label: string }[];
  // The current choice's name when it is known (e.g. the customer's agent).
  selectedLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const searchId = useId();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 300);
  const staff = useStaffOptions({
    ...(staffRole ? { role: staffRole } : {}),
    status,
    ...(term ? { search: term } : {}),
  });
  const items = staff.data?.items ?? [];
  const fixed = [emptyOption, ...extraOptions];
  const known = fixed.some((o) => o.value === value) || items.some((m) => m.id === value);

  return (
    <div className="grid gap-2">
      <Select
        label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        options={[
          ...fixed,
          ...(!known && value
            ? [{ value, label: selectedLabel ?? t('admin.picker.selected') }]
            : []),
          ...items.map((member) => ({
            value: member.id,
            label: member.isActive
              ? member.fullName
              : t('admin.customers.inactiveAgent', { name: member.fullName }),
          })),
        ]}
      />
      <Input
        id={searchId}
        label={<span className="sr-only">{t('admin.picker.search', { label })}</span>}
        type="search"
        value={search}
        maxLength={100}
        placeholder={t('admin.picker.placeholder')}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
        hint={
          staff.data && staff.data.totalCount > items.length
            ? t('admin.picker.more', { count: staff.data.totalCount })
            : undefined
        }
        trailing={
          <span className="grid size-10 place-items-center text-muted" aria-hidden="true">
            <SearchIcon />
          </span>
        }
      />
    </div>
  );
}
