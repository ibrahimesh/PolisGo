import { USER_ROLES } from '../../api/types';
import type { UserRole } from '../../api/types';

// Single source for which role sees which workspace section. The router
// guards, the sidebar, the mobile bottom bar and the command palette all read
// this, so they can't drift apart. Roles mirror the [Authorize(Roles = ...)]
// attributes on the API controllers — the API is the real check.
//
// `mobile` lists the roles whose bottom bar holds the section (five slots at
// most per role); the rest stay reachable from the user menu and the palette.
const STAFF = ['Agent', 'Adjuster', 'Admin'] as const satisfies readonly UserRole[];

// For an Admin, the overview is the admin dashboard.
export const WORKSPACE_SECTIONS = [
  { id: 'overview', path: '/app', roles: USER_ROLES, mobile: USER_ROLES },
  { id: 'policies', path: '/app/policies', roles: ['Client'], mobile: ['Client'] },
  { id: 'buy', path: '/app/buy', roles: ['Client'], mobile: ['Client'] },
  // Same path as the claims queue: one route, the role picks the page.
  { id: 'myClaims', path: '/app/claims', roles: ['Client'], mobile: ['Client'] },
  // Staff desks; each matches the roles of the endpoints it calls.
  {
    id: 'claims',
    path: '/app/claims',
    roles: ['Adjuster', 'Admin'],
    mobile: ['Adjuster', 'Admin'],
  },
  {
    id: 'customers',
    path: '/app/customers',
    roles: ['Agent', 'Admin'],
    mobile: ['Agent', 'Admin'],
  },
  { id: 'sales', path: '/app/sales', roles: ['Agent'], mobile: ['Agent'] },
  // The admin panel.
  { id: 'allPolicies', path: '/app/admin/policies', roles: ['Admin'], mobile: [] },
  { id: 'staff', path: '/app/admin/staff', roles: ['Admin'], mobile: ['Admin'] },
  { id: 'audit', path: '/app/admin/audit', roles: ['Admin'], mobile: [] },
  { id: 'policyTypes', path: '/app/admin/policy-types', roles: ['Admin'], mobile: [] },
  { id: 'profile', path: '/app/profile', roles: USER_ROLES, mobile: USER_ROLES },
  { id: 'help', path: '/app/help', roles: USER_ROLES, mobile: [] },
] as const satisfies readonly {
  id: string;
  path: string;
  roles: readonly UserRole[];
  mobile: readonly UserRole[];
}[];

export type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number];
export type WorkspaceSectionId = WorkspaceSection['id'];

// Sections only staff ever see; a Client is never offered one.
export const STAFF_SECTION_IDS = [
  'claims',
  'customers',
  'sales',
  'allPolicies',
  'staff',
  'audit',
  'policyTypes',
] as const;
export type StaffSectionId = (typeof STAFF_SECTION_IDS)[number];

export const isStaff = (role: UserRole) => (STAFF as readonly UserRole[]).includes(role);

export function sectionsFor(role: UserRole) {
  return WORKSPACE_SECTIONS.filter((section) =>
    (section.roles as readonly UserRole[]).includes(role),
  );
}

export function mobileSectionsFor(role: UserRole) {
  return sectionsFor(role).filter((section) =>
    (section.mobile as readonly UserRole[]).includes(role),
  );
}

export function rolesFor(id: WorkspaceSectionId): readonly UserRole[] {
  return WORKSPACE_SECTIONS.find((section) => section.id === id)?.roles ?? [];
}
