import { ErrorPage } from './errors/ErrorPage';

// The catch-all route, public and in the cabinet (ErrorPage picks the scale
// and where "home" is from the path).
export function NotFoundPage() {
  return <ErrorPage kind="notFound" />;
}
