import { shortReference } from './reference';

describe('shortReference', () => {
  it('takes the first 8 characters of a W3C trace id, upper-cased', () => {
    expect(shortReference('00-8f05e497f602ed095d0149881a2e0468-ce9bed5f785d5dd5-00')).toBe(
      '8F05E497',
    );
  });

  it('falls back to the first 8 letters and digits of anything else', () => {
    expect(shortReference('0HN-abc:12_xyz9')).toBe('0HNABC12');
  });
});
