import { Suspense } from "react";
import { RouterProvider, createBrowserRouter } from "react-router";
import { AppShell } from "./components/AppShell";
import { PageSkeleton } from "./components/PageSkeleton";
import { RequireAuth } from "./components/RequireAuth";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { webModules } from "./modules";
import { ForgotPasswordPage } from "./routes/ForgotPasswordPage";
import { LandingPage } from "./routes/LandingPage";
import { LoginPage } from "./routes/LoginPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { OnboardingPage, RequireOnboarded } from "./routes/OnboardingPage";
import { OverviewPage } from "./routes/OverviewPage";
import { ResetPasswordPage } from "./routes/ResetPasswordPage";
import { SettingsPage } from "./routes/SettingsPage";
import { PrivacyPage } from "./routes/legal/PrivacyPage";
import { TermsPage } from "./routes/legal/TermsPage";

// Routes are built from the module registry, never hand-listed per module.
// Core routes (Overview, Settings, Onboarding, auth and legal pages) are the
// only hardcoded entries. Every routed page gets its own `errorElement` so a
// render bug in one page swaps only that page's content, leaving the shell
// working.
const router = createBrowserRouter([
  { path: "/welcome", element: <LandingPage />, errorElement: <RouteErrorBoundary /> },
  { path: "/login", element: <LoginPage />, errorElement: <RouteErrorBoundary /> },
  {
    path: "/forgot-password",
    element: <ForgotPasswordPage />,
    errorElement: <RouteErrorBoundary />,
  },
  // Public: the reset email's recovery session is established on arrival.
  { path: "/reset-password", element: <ResetPasswordPage />, errorElement: <RouteErrorBoundary /> },
  { path: "/terms", element: <TermsPage />, errorElement: <RouteErrorBoundary /> },
  { path: "/privacy", element: <PrivacyPage />, errorElement: <RouteErrorBoundary /> },
  {
    path: "/onboarding",
    element: (
      <RequireAuth>
        <OnboardingPage />
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <RequireOnboarded>
          <AppShell />
        </RequireOnboarded>
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <OverviewPage />, errorElement: <RouteErrorBoundary /> },
      { path: "settings", element: <SettingsPage />, errorElement: <RouteErrorBoundary /> },
      ...webModules.map((m) => ({
        path: m.route.replace(/^\//, ""),
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <m.page />
          </Suspense>
        ),
        errorElement: <RouteErrorBoundary />,
      })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
