import i18n from '../../../i18n';
import { matchAuditCodes } from './auditSearch';

describe('matchAuditCodes', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('finds the codes whose translated label contains the text', async () => {
    await i18n.changeLanguage('ru');
    expect(matchAuditCodes('одобр', i18n.t)).toEqual(['Approved']);
    // "Account created, role — …" mentions a role too.
    expect(matchAuditCodes('РОЛЬ', i18n.t)).toEqual(['RoleChanged', 'StaffCreated']);
    await i18n.changeLanguage('az');
    expect(matchAuditCodes('təsdiq', i18n.t)).toEqual(['Approved']);
    await i18n.changeLanguage('en');
    expect(matchAuditCodes('under review', i18n.t)).toEqual(['UnderReview']);
    expect(matchAuditCodes('assigned', i18n.t)).toEqual(['CustomerAssigned']);
  });

  // JavaScript lowercases "İ" to "i" plus a combining dot, which never
  // matched the label's "i"; the shared fold (foldSearch) maps every I.
  it('folds Azerbaijani capitals the way the API does', async () => {
    await i18n.changeLanguage('az');
    const label = i18n.t('claimStatus.Submitted');
    const capitals = label.toLocaleUpperCase('az');
    expect(capitals).not.toBe(label);
    expect(matchAuditCodes(capitals, i18n.t)).toContain('Submitted');
    expect(matchAuditCodes('İLƏ', i18n.t)).toEqual(matchAuditCodes('ilə', i18n.t));
  });

  it('ignores short text and the template placeholders', () => {
    expect(matchAuditCodes('ap', i18n.t)).toEqual([]);
    expect(matchAuditCodes('status', i18n.t)).not.toContain('Submitted');
    expect(matchAuditCodes('leyla@polisgo.az', i18n.t)).toEqual([]);
  });
});
