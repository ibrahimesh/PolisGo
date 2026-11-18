import { USER_ROLES } from '../../api/types';
import { rolesFor, sectionsFor, STAFF_SECTION_IDS } from './sections';

describe('workspace sections', () => {
  it('never offers a Client a staff area', () => {
    const ids = sectionsFor('Client').map((section) => section.id);
    for (const staff of STAFF_SECTION_IDS) expect(ids).not.toContain(staff);
    expect(ids).toEqual(['overview', 'policies', 'buy', 'myClaims', 'profile', 'help']);
  });

  it('keeps the purchase flow Client-only, as the cabinet endpoints are', () => {
    expect(rolesFor('policies')).toEqual(['Client']);
    expect(rolesFor('buy')).toEqual(['Client']);
    expect(rolesFor('myClaims')).toEqual(['Client']);
  });

  it.each(USER_ROLES)('fits the %s bottom bar in five slots', (role) => {
    const mobile = sectionsFor(role).filter((section) => section.mobile);
    expect(mobile.length).toBeGreaterThan(0);
    expect(mobile.length).toBeLessThanOrEqual(5);
  });

  it('gives every role an overview, a profile and help', () => {
    for (const role of USER_ROLES) {
      const ids = sectionsFor(role).map((section) => section.id);
      expect(ids).toEqual(expect.arrayContaining(['overview', 'profile', 'help']));
    }
  });
});
