import { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PremiumAccessProvider } from '@/lib/PremiumAccessContext';
import ScrollToTop from './components/ScrollToTop';
import AndroidBackHandler from '@/components/AndroidBackHandler';
import { Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppSplash from '@/components/AppSplash';
import ErrorBoundary from '@/components/ErrorBoundary';
import RouteErrorBoundary from '@/components/RouteErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';
import RouteAccessibility from '@/components/RouteAccessibility';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const PageNotFound = lazyWithRetry(() => import('./lib/PageNotFound'));
const AppLayout = lazyWithRetry(() => import('@/components/AppLayout'));
const Login = lazyWithRetry(() => import('@/pages/Login'));
const Register = lazyWithRetry(() => import('@/pages/Register'));
const ForgotPassword = lazyWithRetry(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazyWithRetry(() => import('@/pages/ResetPassword'));
const Onboarding = lazyWithRetry(() => import('@/pages/Onboarding'));
const Today = lazyWithRetry(() => import('@/pages/Today'));
const WeeklyAutopilot = lazyWithRetry(() => import('@/pages/WeeklyAutopilot'));
const Nutrition = lazyWithRetry(() => import('@/pages/Nutrition'));
const AdaptiveMealPlan = lazyWithRetry(() => import('@/pages/AdaptiveMealPlan'));
const Training = lazyWithRetry(() => import('@/pages/Training'));
const AdaptiveTrainingBlock = lazyWithRetry(() => import('@/pages/AdaptiveTrainingBlock'));
const Progress = lazyWithRetry(() => import('@/pages/Progress'));
const VisualProgressCheck = lazyWithRetry(() => import('@/pages/VisualProgressCheck'));
const More = lazyWithRetry(() => import('@/pages/More'));
const Plan = lazyWithRetry(() => import('@/pages/Plan'));
const DecisionHistory = lazyWithRetry(() => import('@/pages/DecisionHistory'));
const Coach = lazyWithRetry(() => import('@/pages/Coach'));
const LifestyleCoach = lazyWithRetry(() => import('@/pages/LifestyleCoach'));
const Profile = lazyWithRetry(() => import('@/pages/Profile'));
const Premium = lazyWithRetry(() => import('@/pages/Premium'));
const Hero = lazyWithRetry(() => import('@/pages/Hero'));
const PublicHome = lazyWithRetry(() => import('@/components/PublicHome'));
const Privacy = lazyWithRetry(() => import('@/pages/Privacy'));
const Terms = lazyWithRetry(() => import('@/pages/Terms'));
const Support = lazyWithRetry(() => import('@/pages/Support'));
const DeleteAccount = lazyWithRetry(() => import('@/pages/DeleteAccount'));
const TdeeCalculator = lazyWithRetry(() => import('@/pages/seo/TdeeCalculator'));
const MacroCalculator = lazyWithRetry(() => import('@/pages/seo/MacroCalculator'));
const LearnIndex = lazyWithRetry(() => import('@/pages/seo/LearnIndex'));
const RecompGuide = lazyWithRetry(() => import('@/pages/seo/RecompGuide'));
const LocationsIndex = lazyWithRetry(() => import('@/pages/seo/LocationsIndex'));
const LocationPage = lazyWithRetry(() => import('@/pages/seo/LocationPage'));
const TipsIndex = lazyWithRetry(() => import('@/pages/seo/TipsIndex'));
const TipArticle = lazyWithRetry(() => import('@/pages/seo/TipArticle'));
const ComparisonsIndex = lazyWithRetry(() => import('@/pages/seo/ComparisonsIndex'));
const ComparisonArticle = lazyWithRetry(() => import('@/pages/seo/ComparisonArticle'));
const RecompGate = lazyWithRetry(() =>
  import('@/lib/RecompContext').then((module) => ({ default: module.RecompGate }))
);
const RequireOnboarding = lazyWithRetry(() =>
  import('@/lib/RecompContext').then((module) => ({ default: module.RequireOnboarding }))
);

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/today" : "/coming-soon"} replace />;
}

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
      <Route path="/" element={<RootRedirect />} />
      <Route path="/hero" element={<Hero />} />
      <Route path="/coming-soon" element={<PublicHome />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/support" element={<Support />} />
      <Route path="/delete-account" element={<DeleteAccount />} />
      <Route path="/tools/tdee-calculator" element={<TdeeCalculator />} />
      <Route path="/tools/macro-calculator" element={<MacroCalculator />} />
      <Route path="/learn" element={<LearnIndex />} />
      <Route path="/learn/body-recomposition-guide" element={<RecompGuide />} />
      <Route path="/locations" element={<LocationsIndex />} />
      <Route path="/locations/:slug" element={<LocationPage />} />
      <Route path="/tips" element={<TipsIndex />} />
      <Route path="/tips/:slug" element={<TipArticle />} />
      <Route path="/compare" element={<ComparisonsIndex />} />
      <Route path="/compare/:slug" element={<ComparisonArticle />} />
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
              <Route path="/today/autopilot" element={<WeeklyAutopilot />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/nutrition/meal-plan" element={<AdaptiveMealPlan />} />
              <Route path="/training" element={<Training />} />
              <Route path="/training/plan" element={<AdaptiveTrainingBlock />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/progress/visual-check" element={<VisualProgressCheck />} />
              <Route path="/more" element={<More />} />
              <Route path="/more/plan" element={<Plan />} />
              <Route path="/more/decisions" element={<DecisionHistory />} />
              <Route path="/more/coach" element={<Coach />} />
              <Route path="/more/coach/lifestyle" element={<LifestyleCoach />} />
              <Route path="/more/profile" element={<Profile />} />
              <Route path="/more/premium" element={<Premium />} />
              {/* Preserve established deep links while using tab-owned routes internally. */}
              <Route path="/plan" element={<Navigate to="/more/plan" replace />} />
              <Route path="/decisions" element={<Navigate to="/more/decisions" replace />} />
              <Route path="/coach" element={<Navigate to="/more/coach" replace />} />
              <Route path="/profile" element={<Navigate to="/more/profile" replace />} />
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
        <PremiumAccessProvider>
          <ErrorBoundary>
            <Router>
              <RouteAccessibility />
              <ScrollToTop />
              <AndroidBackHandler />
              <OfflineBanner />
              <div id="app-content" tabIndex={-1}>
                <RouteErrorBoundary>
                  <Suspense fallback={<AppSplash />}>
                    <AuthenticatedApp />
                  </Suspense>
                </RouteErrorBoundary>
              </div>
            </Router>
          </ErrorBoundary>
          <Toaster />
        </PremiumAccessProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App