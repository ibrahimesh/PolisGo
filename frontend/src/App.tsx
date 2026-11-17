import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { WORKSPACE_SECTIONS } from './features/workspace/sections';

// One chunk per route: the shell (header, footer, auth, i18n) ships in the
// entry bundle; each page and its form/validation code loads on demand.
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
const WorkspaceLayout = lazy(() =>
  import('./features/workspace/WorkspaceLayout').then((m) => ({ default: m.WorkspaceLayout })),
);
const WorkspaceHome = lazy(() =>
  import('./features/workspace/WorkspaceHome').then((m) => ({ default: m.WorkspaceHome })),
);
const WorkspaceSection = lazy(() =>
  import('./features/workspace/WorkspaceSection').then((m) => ({
    default: m.WorkspaceSection,
  })),
);

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        {/* Any signed-in role; nested sections add their own role checks. */}
        <Route path="app" element={<RequireAuth />}>
          <Route element={<WorkspaceLayout />}>
            <Route index element={<WorkspaceHome />} />
            {WORKSPACE_SECTIONS.map((section) => (
              <Route
                key={section.id}
                path={section.id}
                element={
                  <RequireAuth roles={section.roles}>
                    <WorkspaceSection section={section.id} />
                  </RequireAuth>
                }
              />
            ))}
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
