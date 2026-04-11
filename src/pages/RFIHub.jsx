import { Navigate } from "react-router-dom";

// RFIHub.jsx is deprecated — RFIs.jsx is the canonical RFI page.
export default function RFIHub() {
  return <Navigate to="/RFIs" replace />;
}
