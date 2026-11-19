import { z } from 'zod';
import { STAFF_ROLES } from '../../../api/types';
import type { ListStaffQuery, StaffRole, StaffStatusFilter } from '../../../api/types';
import { emailField, fullNameField, newPasswordField } from '../../auth/authSchemas';

// A staff account follows the registration rules (AuthValidation.cs on the
// server); the role is one of the three staff roles.
export const createStaffSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  password: newPasswordField,
  // A radio group's empty value is null: keep the message translated.
  role: z.enum(STAFF_ROLES, { error: 'validation.staffRoleRequired' }),
});
// role starts unset (no default): an untouched radio group fails the enum
// with the translated message.
export type CreateStaffInput = z.input<typeof createStaffSchema>;
export type CreateStaffValues = z.output<typeof createStaffSchema>;

/* ---------- List state in the URL ---------- */

export const STAFF_PAGE_SIZE = 20;
export const STAFF_STATUSES = [
  'All',
  'Active',
  'Inactive',
] as const satisfies readonly StaffStatusFilter[];

export interface StaffListState {
  search: string;
  role: StaffRole | '';
  status: StaffStatusFilter;
  page: number;
}

export const DEFAULT_STAFF_LIST: StaffListState = { search: '', role: '', status: 'All', page: 1 };

export function readStaffList(params: URLSearchParams): StaffListState {
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    search: (params.get('q') ?? '').slice(0, 100),
    role: (STAFF_ROLES as readonly string[]).includes(role) ? (role as StaffRole) : '',
    status: (STAFF_STATUSES as readonly string[]).includes(status)
      ? (status as StaffStatusFilter)
      : 'All',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function writeStaffList(state: StaffListState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set('q', state.search.trim());
  if (state.role) params.set('role', state.role);
  if (state.status !== 'All') params.set('status', state.status);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

export function toStaffQuery(state: StaffListState): ListStaffQuery {
  return {
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
    ...(state.role ? { role: state.role } : {}),
    status: state.status,
    page: state.page,
    pageSize: STAFF_PAGE_SIZE,
  };
}
