import type { SVGProps } from 'react';

// Line icons drawn for PolisGo: 16px grid, 1.5 stroke, no fills.
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
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

export const DashIcon = () => (
  <Icon>
    <path d="M4 8h8" />
  </Icon>
);

export const MenuIcon = () => (
  <Icon>
    <path d="M2 4.5h12M2 8h12M2 11.5h12" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14" />
  </Icon>
);

export const ChevronDownIcon = () => (
  <Icon>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);

/* ---- Cabinet ---- */

export const HomeIcon = () => (
  <Icon>
    <path d="M2.5 7 8 2.5 13.5 7v6.5h-3.5V10h-4v3.5H2.5Z" />
  </Icon>
);

// A document with a folded corner: a policy.
export const PolicyIcon = () => (
  <Icon>
    <path d="M4 1.75h5.5L12.5 4.75v9.5h-8.5Z" />
    <path d="M9.5 1.75v3h3M6 8h4.5M6 10.75h4.5" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const UserIcon = () => (
  <Icon>
    <circle cx="8" cy="5.5" r="2.75" />
    <path d="M2.75 14c.6-2.6 2.7-4.25 5.25-4.25s4.65 1.65 5.25 4.25" />
  </Icon>
);

export const HelpIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M6.25 6.25a1.85 1.85 0 1 1 2.6 1.7c-.55.25-.85.7-.85 1.3v.25M8 11.5h.01" />
  </Icon>
);

export const BellIcon = () => (
  <Icon>
    <path d="M4 11V7a4 4 0 0 1 8 0v4l1.25 1.5H2.75Z" />
    <path d="M6.5 14h3" />
  </Icon>
);

export const BriefcaseIcon = () => (
  <Icon>
    <path d="M2 5h12v8H2ZM5.75 5V3.25h4.5V5M2 8.5h12" />
  </Icon>
);

export const ClipboardIcon = () => (
  <Icon>
    <path d="M5.5 2.75h-2v11h9v-11h-2M5.5 2h5v2h-5ZM5.75 7.5h4.5M5.75 10.25h3" />
  </Icon>
);

export const GaugeIcon = () => (
  <Icon>
    <path d="M2.25 11.5a5.75 5.75 0 1 1 11.5 0M8 11.5l2.5-3.5" />
  </Icon>
);

export const SignOutIcon = () => (
  <Icon>
    <path d="M6.5 2.5h-4v11h4M10 5l3 3-3 3M13 8H6" />
  </Icon>
);

export const DownloadIcon = () => (
  <Icon>
    <path d="M8 2v8.5M4.75 7.25 8 10.5l3.25-3.25M2.5 13.5h11" />
  </Icon>
);

export const ArrowLeftIcon = () => (
  <Icon>
    <path d="M13 8H3M7 4 3 8l4 4" />
  </Icon>
);

export const ChevronLeftIcon = () => (
  <Icon>
    <path d="M10 4 6 8l4 4" />
  </Icon>
);

export const ChevronRightIcon = () => (
  <Icon>
    <path d="M6 4l4 4-4 4" />
  </Icon>
);

export const CarIcon = () => (
  <Icon>
    <path d="M2 10.5V8l1.5-3.5h9L14 8v2.5ZM2 10.5V12h2.25v-1.5M14 10.5V12h-2.25v-1.5M4.75 8h.01M11.25 8h.01" />
  </Icon>
);

export const UploadIcon = () => (
  <Icon>
    <path d="M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10v3.5h11V10" />
  </Icon>
);

export const FileIcon = () => (
  <Icon>
    <path d="M9.5 1.5H4a.5.5 0 0 0-.5.5v12a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V4.5l-3-3Z" />
    <path d="M9.5 1.5v3h3" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.75 9.5h6.5L12 4M6.75 6.5v4.5M9.25 6.5v4.5" />
  </Icon>
);

export const UsersIcon = () => (
  <Icon>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M1.75 13.5c.4-2.4 2.1-3.75 4.25-3.75s3.85 1.35 4.25 3.75M10.5 3.4a2.25 2.25 0 0 1 0 4.2M12 9.9c1.25.5 2 1.7 2.25 3.6" />
  </Icon>
);

export const ChartIcon = () => (
  <Icon>
    <path d="M2 2v12h12M5 11V8M8 11V5M11 11V7" />
  </Icon>
);

// A slider pair: settings, not a gear (reads as "adjust").
export const SettingsIcon = () => (
  <Icon>
    <path d="M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6" />
    <circle cx="10" cy="5" r="1.5" />
    <circle cx="6" cy="11" r="1.5" />
  </Icon>
);

export const CalendarIcon = () => (
  <Icon>
    <rect x="2.5" y="3.5" width="11" height="10" rx="0.5" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </Icon>
);
