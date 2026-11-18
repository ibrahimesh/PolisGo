import { USER_ROLES } from '../../api/types';
import type { UserRole } from '../../api/types';

// Single source for which role sees which workspace section. The router
// guards, the sidebar, the mobile bottom bar and the command palette all read
// this, so they can't drift apart. Roles mirror the [Authorize(Roles = ...)]
// attributes on the API controllers — the API is the real check.
//
// `mobile` puts the section in the bottom bar (five slots at most for any role);
// the rest stay reachable from the user menu and the palette.
export const WORKSPACE_SECTIONS = [
  { id: 'overview', path: '/app', roles: USER_ROLES, mobile: true },
  { id: 'policies', path: '/app/policies', roles: ['Client'], mobile: true },
  { id: 'buy', path: '/app/buy', roles: ['Client'], mobile: true },
  { id: 'agent', path: '/app/agent', roles: ['Agent', 'Admin'], mobile: true },
  { id: 'claims', path: '/app/claims', roles: ['Adjuster', 'Admin'], mobile: true },
  { id: 'admin', path: '/app/admin', roles: ['Admin'], mobile: true },
  { id: 'profile', path: '/app/profile', roles: USER_ROLES, mobile: true },
  { id: 'help', path: '/app/help', roles: USER_ROLES, mobile: false },
] as const satisfies readonly {
  id: string;
  path: string;
  roles: readonly UserRole[];
  mobile: boolean;
}[];

export type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]['id'];

// Staff areas that still render the "next on the roadmap" placeholder.
export const STAFF_SECTION_IDS = ['agent', 'claims', 'admin'] as const;
export type StaffSectionId = (typeof STAFF_SECTION_IDS)[number];

export function sectionsFor(role: UserRole) {
  return WORKSPACE_SECTIONS.filter((section) =>
    (section.roles as readonly UserRole[]).includes(role),
  );
}

export function rolesFor(id: WorkspaceSectionId): readonly UserRole[] {
  return WORKSPACE_SECTIONS.find((section) => section.id === id)?.roles ?? [];
}
