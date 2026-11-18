import { useAuth } from '../../auth/AuthContext';
import { StaffOverview } from '../staff/StaffOverview';
import { ClientOverview } from './ClientOverview';

// /app: Clients get their cabinet overview (whose endpoints are Client-only),
// staff the overview of their desks.
export function CabinetHome() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'Client' ? <ClientOverview /> : <StaffOverview />;
}
