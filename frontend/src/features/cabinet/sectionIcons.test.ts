import { USER_ROLES } from '../../api/types';
import { WORKSPACE_SECTIONS, sectionsFor } from '../workspace/sections';
import { SECTION_ICONS } from './sectionIcons';

describe('section icons', () => {
  it('gives every section an icon', () => {
    for (const section of WORKSPACE_SECTIONS)
      expect(SECTION_ICONS[section.id]).toBeTypeOf('function');
  });

  it("never repeats an icon within one role's navigation", () => {
    for (const role of USER_ROLES) {
      const icons = sectionsFor(role).map((section) => SECTION_ICONS[section.id]);
      expect(new Set(icons).size, role).toBe(icons.length);
    }
  });
});
