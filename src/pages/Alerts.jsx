import { Navigate } from "react-router-dom";

// Alerts.jsx is deprecated — AlertsCenter.jsx is the canonical alerts page.
export default function Alerts() {
  return <Navigate to="/AlertsCenter" replace />;
}
