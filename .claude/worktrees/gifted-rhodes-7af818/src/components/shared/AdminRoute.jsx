import React from "react";
import { useAuth } from "@/lib/AuthContext";

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "rgba(160,175,210,0.55)" }}>
        Checking permissions...
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div style={{
        padding: "60px 40px",
        textAlign: "center",
        maxWidth: 600,
        margin: "0 auto"
      }}>
        <div style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--nc-accent-red)",
          marginBottom: 12
        }}>
          Access Denied
        </div>
        <div style={{
          fontSize: 14,
          color: "rgba(160,175,210,0.55)",
          lineHeight: 1.6
        }}>
          This page is restricted to administrators only. You are logged in as a regular user.
        </div>
      </div>
    );
  }

  return children;
}