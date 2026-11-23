import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
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
const CrashPage = lazy(() => import('./pages/CrashPage').then((m) => ({ default: m.CrashPage })));
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
const StaffPage = lazy(() =>
  import('./features/admin/staff/StaffPage').then((m) => ({ default: m.StaffPage })),
);
const AuditPage = lazy(() =>
  import('./features/admin/audit/AuditPage').then((m) => ({ default: m.AuditPage })),
);
const PolicyTypesPage = lazy(() =>
  import('./features/admin/PolicyTypesPage').then((m) => ({ default: m.PolicyTypesPage })),
);

// Routes that exist only for the e2e suite (set at build time; never in a
// production build).
const E2E_ROUTES = import.meta.env.VITE_E2E_ROUTES === 'true';

// Same roles as the sidebar and the API's [Authorize(Roles = ...)].
const guard = (id: WorkspaceSectionId) => <RequireAuth roles={rolesFor(id)} />;

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        {E2E_ROUTES && <Route path="__e2e/crash" element={<CrashPage />} />}
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
            {/* Agents sell to their own customers; Admins to anyone. */}
            <Route path=":id/sell" element={<SellPolicyPage />} />
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

          {/* The admin panel; its dashboard is the Admin's overview at /app. */}
          <Route path="admin" element={guard('staff')}>
            <Route index element={<Navigate to="/app" replace />} />
            <Route path="policies" element={<SalesPage mode="admin" />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="policy-types" element={<PolicyTypesPage />} />
          </Route>

          {E2E_ROUTES && <Route path="__e2e/crash" element={<CrashPage />} />}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
