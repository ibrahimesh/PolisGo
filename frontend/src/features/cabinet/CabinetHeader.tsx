import type { ReactNode } from 'react';
import { ConnectionBanner } from '../../components/layout/ConnectionBanner';
import { PaletteLauncher } from '../../components/layout/PaletteLauncher';
import { LogoLink } from '../../components/layout/Wordmark';
import { UserMenu } from './UserMenu';

// Top bar of the signed-in area. The wordmark lives in the sidebar on
// desktop, so here it only shows on smaller screens. Language and theme are
// in Settings (user menu), not here.
export function CabinetHeader({ notifications }: { notifications?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-10">
        <LogoLink className="lg:hidden" />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <PaletteLauncher />
          {notifications}
          <UserMenu />
        </div>
      </div>
      <ConnectionBanner />
    </header>
  );
}
