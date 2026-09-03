import React, { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "../types/api";
import { authService } from "../services/auth";
import { authEvents } from "../services/api";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (userData: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const defaultDemoUser: User = {
  id: "demo_admin",
  tenantId: "tenant_demo_001",
  name: "Razorpay Judge / Demo",
  email: "judge@razorpay.com",
  role: "admin",
  mfaEnabled: false,
  created_at: new Date().toISOString(),
};

const isTestEnv = import.meta.env.MODE === "test";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (isTestEnv) {
      return null;
    }
    return defaultDemoUser;
  });

  const [isLoading, setIsLoading] = useState(() => {
    if (isTestEnv) {
      return !!localStorage.getItem("auth_token");
    }
    return false;
  });

  const navigate = useNavigate();

  useEffect(() => {
    if (!isTestEnv && !localStorage.getItem("auth_token")) {
      localStorage.setItem("auth_token", "demo_bearer_token");
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setUser(null);
      localStorage.removeItem("auth_token");
      navigate("/login");
    };
    authEvents.addEventListener("unauthorized", handler);
    return () => authEvents.removeEventListener("unauthorized", handler);
  }, [navigate]);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      const getMePromise = authService.getMe?.();
      if (getMePromise && typeof getMePromise.then === "function") {
        getMePromise
          .then((userData) => {
            if (userData) setUser(userData);
          })
          .catch(() => {
            localStorage.removeItem("auth_token");
            setUser(null);
          })
          .finally(() => {
            setIsLoading(false);
          });
      } else {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (token: string, userData: User) => {
    localStorage.setItem("auth_token", token);
    setUser(userData);
  };

  const logout = () => {
    authService.logout();
    localStorage.removeItem("auth_token");
    setUser(null);
  };

  const updateUser = (userData: User) => {
    setUser(userData);
  };

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
