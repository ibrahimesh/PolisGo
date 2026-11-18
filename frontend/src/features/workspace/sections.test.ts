import { USER_ROLES } from '../../api/types';
import { mobileSectionsFor, rolesFor, sectionsFor, STAFF_SECTION_IDS } from './sections';

const ids = (role: (typeof USER_ROLES)[number]) => sectionsFor(role).map((section) => section.id);

describe('workspace sections', () => {
  it('never offers a Client a staff area', () => {
    for (const staff of STAFF_SECTION_IDS) expect(ids('Client')).not.toContain(staff);
    expect(ids('Client')).toEqual(['overview', 'policies', 'buy', 'myClaims', 'profile', 'help']);
  });

  it('keeps the purchase flow Client-only, as the cabinet endpoints are', () => {
    expect(rolesFor('policies')).toEqual(['Client']);
    expect(rolesFor('buy')).toEqual(['Client']);
    expect(rolesFor('myClaims')).toEqual(['Client']);
  });

  // Mirrors the controllers: decisions are Adjuster/Admin, the customer book
  // and sales Agent/Admin.
  it('gives each staff role only its own desks', () => {
    expect(ids('Adjuster')).toEqual(['overview', 'claims', 'profile', 'help']);
    expect(ids('Agent')).toEqual(['overview', 'customers', 'sales', 'profile', 'help']);
    expect(ids('Admin')).toEqual([
      'overview',
      'claims',
      'customers',
      'sales',
      'admin',
      'profile',
      'help',
    ]);
  });

  it.each(USER_ROLES)('fits the %s bottom bar in five slots', (role) => {
    const mobile = mobileSectionsFor(role);
    expect(mobile.length).toBeGreaterThan(0);
    expect(mobile.length).toBeLessThanOrEqual(5);
    // Only sections the role may open.
    for (const section of mobile) expect(ids(role)).toContain(section.id);
  });

  it('gives every role an overview, a profile and help', () => {
    for (const role of USER_ROLES) {
      expect(ids(role)).toEqual(expect.arrayContaining(['overview', 'profile', 'help']));
    }
  });
});
