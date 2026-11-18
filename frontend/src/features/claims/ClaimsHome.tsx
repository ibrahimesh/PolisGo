import { useAuth } from '../../auth/AuthContext';
import { WorkspaceSection } from '../workspace/WorkspaceSection';
import { ClaimsPage } from './ClaimsPage';

// /app/claims: a Client's own claims; Adjusters and Admins still get the
// claims desk placeholder until that screen is built.
export function ClaimsHome() {
  const { user } = useAuth();
  return user?.role === 'Client' ? <ClaimsPage /> : <WorkspaceSection section="claims" />;
}
