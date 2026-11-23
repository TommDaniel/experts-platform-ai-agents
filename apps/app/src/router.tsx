import { createBrowserRouter, Outlet } from "react-router-dom";
import { AppShell } from "./components/app/app-shell";
import { RedirectIfAuthenticated } from "./components/guards/redirect-if-authenticated";
import { RequireAuth } from "./components/guards/require-auth";
import { RootRedirect } from "./components/guards/root-redirect";
import { AuthProvider } from "./contexts/auth-context";
import { HomePage } from "./pages/app/home";
import { ConfirmAccountPage } from "./pages/auth/confirm-account";
import { ForgotPasswordPage } from "./pages/auth/forgot-password";
import { ResetPasswordPage } from "./pages/auth/reset-password";
import { SignInPage } from "./pages/auth/sign-in";
import { SignUpPage } from "./pages/auth/sign-up";
import { NotFoundPage } from "./pages/not-found";

export const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      { path: "/", element: <RootRedirect /> },
      {
        element: <RedirectIfAuthenticated />,
        children: [
          { path: "/auth/sign-in", element: <SignInPage /> },
          { path: "/auth/sign-up", element: <SignUpPage /> },
          { path: "/auth/forgot-password", element: <ForgotPasswordPage /> },
          { path: "/auth/reset-password", element: <ResetPasswordPage /> },
          { path: "/auth/confirm-account", element: <ConfirmAccountPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "/app",
            element: <AppShell />,
            children: [
              { index: true, element: <HomePage /> },
              { path: "experts", element: <HomePage /> },
              { path: "connectors", element: <HomePage /> },
              { path: "*", element: <HomePage /> },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
