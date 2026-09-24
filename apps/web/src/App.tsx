import { Suspense } from "react";
import { RouterProvider, createBrowserRouter } from "react-router";
import { AppShell } from "./components/AppShell";
import { PageSkeleton } from "./components/PageSkeleton";
import { RequireAuth } from "./components/RequireAuth";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { webModules } from "./modules";
import { LoginPage } from "./routes/LoginPage";
import { NotFoundPage } from "./routes/NotFoundPage";
import { OnboardingPage, RequireOnboarded } from "./routes/OnboardingPage";
import { OverviewPage } from "./routes/OverviewPage";
import { SettingsPage } from "./routes/SettingsPage";

// Routes are built from the module registry, never hand-listed per module.
// Core routes (Overview, Settings, Onboarding) are the only hardcoded
// entries. Every routed page gets its own `errorElement` so a render bug in
// one page swaps only that page's content, leaving the shell working.
const router = createBrowserRouter([
  { path: "/login", element: <LoginPage />, errorElement: <RouteErrorBoundary /> },
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
