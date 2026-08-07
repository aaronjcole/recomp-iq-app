import { useLocation } from "react-router-dom";
import ErrorBoundary from "@/components/ErrorBoundary";

// Route-scoped boundary: a crash inside one screen shows an inline card and
// leaves the shell (nav, offline banner, back handler) interactive. Keying on
// the pathname clears the error the moment the user navigates elsewhere.
export default function RouteErrorBoundary({ children }) {
  const location = useLocation();
  return (
    <ErrorBoundary variant="inline" name="route" resetKey={location.pathname}>
      {children}
    </ErrorBoundary>
  );
}
