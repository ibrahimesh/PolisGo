import type { SVGProps } from 'react';

// Hairline icon set drawn for PolisGo: 16px grid, 1.25 stroke, no fills.
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const MoonIcon = () => (
  <Icon>
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" />
  </Icon>
);

export const SunIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
  </Icon>
);

export const SystemIcon = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="8.5" rx="0.5" />
    <path d="M5.5 14h5M8 11.5V14" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);

export const ArrowRightIcon = () => (
  <Icon>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);

export const EyeIcon = () => (
  <Icon>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);

export const EyeOffIcon = () => (
  <Icon>
    <path d="M2 2l12 12M6.6 3.7A6.6 6.6 0 0 1 8 3.5C12 3.5 14.5 8 14.5 8a11 11 0 0 1-1.9 2.4M10.3 11.9A6 6 0 0 1 8 12.5C4 12.5 1.5 8 1.5 8a11.4 11.4 0 0 1 2.6-3" />
  </Icon>
);

export const AlertIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 4.75v3.75M8 11h.01" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="M3 8.5l3 3 7-7" />
  </Icon>
);
