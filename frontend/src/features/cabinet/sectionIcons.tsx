import type { ComponentType } from 'react';
import {
  BriefcaseIcon,
  ChartIcon,
  ClipboardIcon,
  HelpIcon,
  HistoryIcon,
  HomeIcon,
  InboxIcon,
  PlusIcon,
  PolicyIcon,
  PulseIcon,
  StackIcon,
  TagIcon,
  UserIcon,
  UsersIcon,
} from '../../components/ui/icons';
import type { WorkspaceSectionId } from '../workspace/sections';

// One meaningful icon per section, never shared within a role's sidebar
// (sectionIcons.test.ts checks it), so the rail can be scanned by shape.
export const SECTION_ICONS: Record<WorkspaceSectionId, ComponentType> = {
  overview: HomeIcon,
  policies: PolicyIcon,
  buy: PlusIcon,
  myClaims: ClipboardIcon,
  claims: InboxIcon,
  customers: UsersIcon,
  sales: ChartIcon,
  allPolicies: StackIcon,
  staff: BriefcaseIcon,
  audit: HistoryIcon,
  policyTypes: TagIcon,
  system: PulseIcon,
  profile: UserIcon,
  help: HelpIcon,
};
