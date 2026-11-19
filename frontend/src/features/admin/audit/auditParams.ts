import { AUDIT_ENTITY_TYPES } from '../../../api/types';
import type { AuditEntityType, AuditLogQuery } from '../../../api/types';
import { isCompleteIso } from '../../../lib/dateInput';

// The audit feed's filters live in the URL. Ids and dates that don't parse
// are dropped, and a reversed range is ignored, rather than sent as a 400.

export const AUDIT_PAGE_SIZE = 25;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditState {
  actor: string;
  type: AuditEntityType | '';
  from: string;
  to: string;
  page: number;
}

export const DEFAULT_AUDIT: AuditState = { actor: '', type: '', from: '', to: '', page: 1 };

export function readAudit(params: URLSearchParams): AuditState {
  const actor = params.get('actor') ?? '';
  const type = params.get('type') ?? '';
  let from = params.get('from') ?? '';
  let to = params.get('to') ?? '';
  if (!isCompleteIso(from)) from = '';
  if (!isCompleteIso(to)) to = '';
  if (from && to && from > to) [from, to] = ['', ''];
  const page = Number.parseInt(params.get('page') ?? '', 10);
  return {
    actor: GUID.test(actor) ? actor : '',
    type: (AUDIT_ENTITY_TYPES as readonly string[]).includes(type) ? (type as AuditEntityType) : '',
    from,
    to,
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 200) : 1,
  };
}

export function writeAudit(state: AuditState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.actor) params.set('actor', state.actor);
  if (state.type) params.set('type', state.type);
  if (state.from) params.set('from', state.from);
  if (state.to) params.set('to', state.to);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}

export function toAuditQuery(state: AuditState): AuditLogQuery {
  return {
    ...(state.actor ? { actorId: state.actor } : {}),
    ...(state.type ? { entityType: state.type } : {}),
    ...(state.from ? { from: state.from } : {}),
    ...(state.to ? { to: state.to } : {}),
    page: state.page,
    pageSize: AUDIT_PAGE_SIZE,
  };
}

export function hasAuditFilters(state: AuditState): boolean {
  return Boolean(state.actor || state.type || state.from || state.to);
}
