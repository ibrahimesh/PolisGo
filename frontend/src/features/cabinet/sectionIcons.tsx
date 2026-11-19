import type { ComponentType } from 'react';
import {
  BriefcaseIcon,
  ChartIcon,
  ClipboardIcon,
  FileIcon,
  GaugeIcon,
  HelpIcon,
  HomeIcon,
  PlusIcon,
  PolicyIcon,
  UserIcon,
  UsersIcon,
} from '../../components/ui/icons';
import type { WorkspaceSectionId } from '../workspace/sections';

export const SECTION_ICONS: Record<WorkspaceSectionId, ComponentType> = {
  overview: HomeIcon,
  policies: PolicyIcon,
  buy: PlusIcon,
  claims: ClipboardIcon,
  customers: UsersIcon,
  sales: ChartIcon,
  allPolicies: PolicyIcon,
  staff: BriefcaseIcon,
  audit: FileIcon,
  policyTypes: GaugeIcon,
  myClaims: ClipboardIcon,
  profile: UserIcon,
  help: HelpIcon,
};
