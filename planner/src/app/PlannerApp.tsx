import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { queryClientInstance } from "@/lib/query-client";
import PlannerAuthGate from "@planner/app/PlannerAuthGate";
import PlannerRoutes from "@planner/app/PlannerRoutes";

export default function PlannerApp() {
  return (
    <div className="planner-app">
      <QueryClientProvider client={queryClientInstance}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <PlannerAuthGate>
              <PlannerRoutes />
            </PlannerAuthGate>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </div>
  );
}
