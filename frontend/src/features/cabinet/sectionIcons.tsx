import type { ComponentType } from 'react';
import {
  BriefcaseIcon,
  ClipboardIcon,
  GaugeIcon,
  HelpIcon,
  HomeIcon,
  PlusIcon,
  PolicyIcon,
  UserIcon,
} from '../../components/ui/icons';
import type { WorkspaceSectionId } from '../workspace/sections';

export const SECTION_ICONS: Record<WorkspaceSectionId, ComponentType> = {
  overview: HomeIcon,
  policies: PolicyIcon,
  buy: PlusIcon,
  agent: BriefcaseIcon,
  claims: ClipboardIcon,
  myClaims: ClipboardIcon,
  admin: GaugeIcon,
  profile: UserIcon,
  help: HelpIcon,
};
