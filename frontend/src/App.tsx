import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { CabinetShell } from './features/cabinet/CabinetShell';
import { rolesFor, STAFF_SECTION_IDS } from './features/workspace/sections';
import type { WorkspaceSectionId } from './features/workspace/sections';

// One chunk per route: the shells (header, auth, i18n) ship in the entry
// bundle; each page and its form/validation code loads on demand.
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
const CabinetHome = lazy(() =>
  import('./features/overview/CabinetHome').then((m) => ({ default: m.CabinetHome })),
);
const PoliciesPage = lazy(() =>
  import('./features/policies/PoliciesPage').then((m) => ({ default: m.PoliciesPage })),
);
const PolicyDetailPage = lazy(() =>
  import('./features/policies/PolicyDetailPage').then((m) => ({ default: m.PolicyDetailPage })),
);
const BuyPolicyPage = lazy(() =>
  import('./features/wizard/BuyPolicyPage').then((m) => ({ default: m.BuyPolicyPage })),
);
const ProfilePage = lazy(() =>
  import('./features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const HelpPage = lazy(() =>
  import('./features/help/HelpPage').then((m) => ({ default: m.HelpPage })),
);
const ClaimsHome = lazy(() =>
  import('./features/claims/ClaimsHome').then((m) => ({ default: m.ClaimsHome })),
);
const NewClaimPage = lazy(() =>
  import('./features/claims/wizard/NewClaimPage').then((m) => ({ default: m.NewClaimPage })),
);
const ClaimDetailPage = lazy(() =>
  import('./features/claims/ClaimDetailPage').then((m) => ({ default: m.ClaimDetailPage })),
);
const WorkspaceSection = lazy(() =>
  import('./features/workspace/WorkspaceSection').then((m) => ({
    default: m.WorkspaceSection,
  })),
);

// Same roles as the sidebar and the API's [Authorize(Roles = ...)].
const guard = (id: WorkspaceSectionId) => <RequireAuth roles={rolesFor(id)} />;

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Any signed-in role; nested sections add their own role checks. */}
      <Route path="app" element={<RequireAuth />}>
        <Route element={<CabinetShell />}>
          <Route index element={<CabinetHome />} />

          <Route path="policies" element={guard('policies')}>
            <Route index element={<PoliciesPage />} />
            <Route path=":id" element={<PolicyDetailPage />} />
          </Route>

          <Route path="buy" element={guard('buy')}>
            <Route index element={<BuyPolicyPage />} />
          </Route>

          {/* Clients' claims and the staff desk share the path. */}
          <Route
            path="claims"
            element={<RequireAuth roles={[...rolesFor('myClaims'), ...rolesFor('claims')]} />}
          >
            <Route index element={<ClaimsHome />} />
            <Route element={guard('myClaims')}>
              <Route path="new" element={<NewClaimPage />} />
              <Route path=":id" element={<ClaimDetailPage />} />
            </Route>
          </Route>

          <Route path="profile" element={guard('profile')}>
            <Route index element={<ProfilePage />} />
          </Route>
          <Route path="help" element={guard('help')}>
            <Route index element={<HelpPage />} />
          </Route>

          {STAFF_SECTION_IDS.filter((id) => id !== 'claims').map((id) => (
            <Route key={id} path={id} element={guard(id)}>
              <Route index element={<WorkspaceSection section={id} />} />
            </Route>
          ))}

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
