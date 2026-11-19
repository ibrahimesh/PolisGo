import { lazy } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { StaffOverview } from '../staff/StaffOverview';
import { ClientOverview } from './ClientOverview';

// Its charts load only for Admins.
const AdminDashboard = lazy(() =>
  import('../admin/dashboard/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
);

// /app: Clients get their cabinet overview (whose endpoints are Client-only),
// Agents and Adjusters the overview of their desks, Admins the dashboard.
export function CabinetHome() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === 'Admin') return <AdminDashboard />;
  return user.role === 'Client' ? <ClientOverview /> : <StaffOverview />;
}
