import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { CabinetShell } from './features/cabinet/CabinetShell';
import { rolesFor } from './features/workspace/sections';
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
const ClaimDetailHome = lazy(() =>
  import('./features/claims/ClaimsHome').then((m) => ({ default: m.ClaimDetailHome })),
);
const CustomersPage = lazy(() =>
  import('./features/staff/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })),
);
const CustomerDetailPage = lazy(() =>
  import('./features/staff/customers/CustomerDetailPage').then((m) => ({
    default: m.CustomerDetailPage,
  })),
);
const SellPolicyPage = lazy(() =>
  import('./features/staff/sales/SellPolicyPage').then((m) => ({ default: m.SellPolicyPage })),
);
const SalesPage = lazy(() =>
  import('./features/staff/sales/SalesPage').then((m) => ({ default: m.SalesPage })),
);
const NewClaimPage = lazy(() =>
  import('./features/claims/wizard/NewClaimPage').then((m) => ({ default: m.NewClaimPage })),
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

          {/* Clients' claims and the claims queue share the path; the page
              picks by role. Filing a claim is the Client's alone. */}
          <Route
            path="claims"
            element={<RequireAuth roles={[...rolesFor('myClaims'), ...rolesFor('claims')]} />}
          >
            <Route index element={<ClaimsHome />} />
            <Route path=":id" element={<ClaimDetailHome />} />
            <Route element={guard('myClaims')}>
              <Route path="new" element={<NewClaimPage />} />
            </Route>
          </Route>

          <Route path="customers" element={guard('customers')}>
            <Route index element={<CustomersPage />} />
            <Route path=":id" element={<CustomerDetailPage />} />
            {/* Selling uses the sales section's roles, as the API does. */}
            <Route element={guard('sales')}>
              <Route path=":id/sell" element={<SellPolicyPage />} />
            </Route>
          </Route>

          <Route path="sales" element={guard('sales')}>
            <Route index element={<SalesPage />} />
          </Route>

          <Route path="profile" element={guard('profile')}>
            <Route index element={<ProfilePage />} />
          </Route>
          <Route path="help" element={guard('help')}>
            <Route index element={<HelpPage />} />
          </Route>

          {/* The admin panel is the next step; its guard is already real. */}
          <Route path="admin" element={guard('admin')}>
            <Route index element={<WorkspaceSection section="admin" />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
