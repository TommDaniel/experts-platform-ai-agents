import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../contexts/auth-context";
import { LoadingScreen } from "./loading-screen";

export function RedirectIfAuthenticated() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  return <Outlet />;
}
