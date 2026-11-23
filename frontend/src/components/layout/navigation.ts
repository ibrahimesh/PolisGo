// Landing page sections, in page order. Header, mobile menu, command palette
// and footer all link to these ids, so they are defined once.
export const LANDING_SECTIONS = ['calculator', 'pricing', 'coverage', 'claims', 'faq'] as const;
export type LandingSection = (typeof LANDING_SECTIONS)[number];

// The header shows the primary sections from lg; the secondary ones join
// them from xl and sit under "More" in between, so no label ever wraps.
export const PRIMARY_SECTIONS = ['calculator', 'pricing', 'coverage'] as const;
export const SECONDARY_SECTIONS = ['claims', 'faq'] as const;
