import type { UserRole } from '../../api/types';

// Single source for which role sees which workspace section. The router guard
// and the side navigation both read this, so they can't drift apart. Roles
// mirror the [Authorize(Roles = ...)] attributes on the API controllers.
export const WORKSPACE_SECTIONS = [
  { id: 'agent', path: '/app/agent', roles: ['Agent', 'Admin'] },
  { id: 'claims', path: '/app/claims', roles: ['Adjuster', 'Admin'] },
  { id: 'admin', path: '/app/admin', roles: ['Admin'] },
] as const satisfies readonly { id: string; path: string; roles: readonly UserRole[] }[];

export type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]['id'];

export function sectionsFor(role: UserRole) {
  return WORKSPACE_SECTIONS.filter((section) =>
    (section.roles as readonly UserRole[]).includes(role),
  );
}
