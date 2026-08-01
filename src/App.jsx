import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import AndroidBackHandler from '@/components/AndroidBackHandler';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppSplash from '@/components/AppSplash';
import ErrorBoundary from '@/components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';

const PageNotFound = lazy(() => import('./lib/PageNotFound'));
const AppLayout = lazy(() => import('@/components/AppLayout'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Today = lazy(() => import('@/pages/Today'));
const Nutrition = lazy(() => import('@/pages/Nutrition'));
const Training = lazy(() => import('@/pages/Training'));
const Progress = lazy(() => import('@/pages/Progress'));
const More = lazy(() => import('@/pages/More'));
const Plan = lazy(() => import('@/pages/Plan'));
const DecisionHistory = lazy(() => import('@/pages/DecisionHistory'));
const Coach = lazy(() => import('@/pages/Coach'));
const Profile = lazy(() => import('@/pages/Profile'));
const Hero = lazy(() => import('@/pages/Hero'));
const ComingSoon = lazy(() => import('@/pages/ComingSoon'));
const PublicHome = lazy(() => import('@/components/PublicHome'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Terms = lazy(() => import('@/pages/Terms'));
const Support = lazy(() => import('@/pages/Support'));
const DeleteAccount = lazy(() => import('@/pages/DeleteAccount'));
const RecompGate = lazy(() =>
  import('@/lib/RecompContext').then((module) => ({ default: module.RecompGate }))
);
const RequireOnboarding = lazy(() =>
  import('@/lib/RecompContext').then((module) => ({ default: module.RequireOnboarding }))
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppSplash />;
  }

  // Public routes must remain available even when Base44 reports that app
  // authentication is required. ProtectedRoute owns auth errors for app data.
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/hero" element={<Hero />} />
      <Route path="/coming-soon" element={<ComingSoon />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/support" element={<Support />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<RecompGate />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<RequireOnboarding />}>
            <Route element={<AppLayout />}>
              <Route path="/today" element={<Today />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/training" element={<Training />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/decisions" element={<DecisionHistory />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/more" element={<More />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ErrorBoundary>
          <Router>
            <ScrollToTop />
            <AndroidBackHandler />
            <OfflineBanner />
            <Suspense fallback={<AppSplash />}>
              <AuthenticatedApp />
            </Suspense>
          </Router>
        </ErrorBoundary>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
