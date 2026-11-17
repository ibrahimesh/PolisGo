// Landing page sections, in page order. Header, mobile menu, command palette
// and footer all link to these ids, so they are defined once.
export const LANDING_SECTIONS = ['calculator', 'pricing', 'coverage', 'claims', 'faq'] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];
