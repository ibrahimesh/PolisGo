import { useAuth } from '../../auth/AuthContext';
import { ClaimsQueuePage } from '../staff/queue/ClaimsQueuePage';
import { ClaimReviewPage } from '../staff/review/ClaimReviewPage';
import { ClaimDetailPage } from './ClaimDetailPage';
import { ClaimsPage } from './ClaimsPage';

// /app/claims and /app/claims/:id are shared: a Client gets their own claims,
// Adjusters and Admins the queue and the review page. The route guard has
// already kept every other role out.
export function ClaimsHome() {
  const { user } = useAuth();
  return user?.role === 'Client' ? <ClaimsPage /> : <ClaimsQueuePage />;
}

export function ClaimDetailHome() {
  const { user } = useAuth();
  return user?.role === 'Client' ? <ClaimDetailPage /> : <ClaimReviewPage />;
}
