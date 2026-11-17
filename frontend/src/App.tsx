import { Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './components/layout/AppShell';
import { WORKSPACE_SECTIONS } from './features/workspace/sections';
import { WorkspaceHome } from './features/workspace/WorkspaceHome';
import { WorkspaceLayout } from './features/workspace/WorkspaceLayout';
import { WorkspaceSection } from './features/workspace/WorkspaceSection';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RegisterPage } from './pages/RegisterPage';

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
