import { useAuth } from '../../auth/AuthContext';
import { WorkspaceHome } from '../workspace/WorkspaceHome';
import { ClientOverview } from './ClientOverview';

// /app: Clients get their cabinet overview (whose endpoints are Client-only);
// staff keep the workspace home until their desks are built.
export function CabinetHome() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'Client' ? <ClientOverview /> : <WorkspaceHome />;
}
