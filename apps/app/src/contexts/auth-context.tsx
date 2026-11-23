import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, apiClient, clearStoredToken, getStoredToken } from "../lib/api-client";

export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  emailVerifiedAt: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(() => getStoredToken() !== null);

  const refresh = useCallback(async () => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      setToken(null);
      setUser(null);
      setIsLoading(false);
      return;
    }
    setToken(storedToken);
    setIsLoading(true);
    try {
      const currentUser = await apiClient.get<AuthUser>("/auth/me");
      setUser(currentUser);
      setIsLoading(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearStoredToken();
        setToken(null);
        setUser(null);
        setIsLoading(false);
        return;
      }
      // Network or unexpected failure: keep loading so the guards never flash
      // protected content or expel the user due to instability; retry via refresh().
      setIsLoading(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Best-effort: revoke server-side, but always clear the local session.
    }
    clearStoredToken();
    setUser(null);
    setToken(null);
    navigate("/auth/sign-in", { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: user !== null,
      signOut,
      refresh,
    }),
    [user, token, isLoading, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
