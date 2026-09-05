import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./layouts/AppLayout";
import { PortfolioOverview } from "./pages/PortfolioOverview";
import { RecoveryDashboard } from "./pages/RecoveryDashboard";
import { Customers } from "./pages/Customers";
import { Invoices } from "./pages/Invoices";
import { InvoiceDetail } from "./pages/InvoiceDetail";
import { Agent } from "./pages/Agent";
import { DLQ } from "./pages/DLQ";
import { WorkflowsPolicy } from "./pages/WorkflowsPolicy";
import { Analytics } from "./pages/Analytics";
import { AuditTrustCenter } from "./pages/AuditTrustCenter";
import { Settings } from "./pages/Settings";
import { ActivityLog } from "./pages/ActivityLog";
import { Disputes } from "./pages/Disputes";
import { PaymentPlans } from "./pages/PaymentPlans";
import { AcceptInvitation } from "./pages/AcceptInvitation";
import { DebtorPortal } from "./pages/DebtorPortal";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ProtectedRoute } from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/invite" element={<AcceptInvitation />} />
      <Route path="/i/:token" element={<DebtorPortal />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          {/* 1. Portfolio Overview */}
          <Route path="/" element={<PortfolioOverview />} />
          <Route path="/overview" element={<PortfolioOverview />} />
          <Route path="/dashboard" element={<Dashboard />} />

          {/* 2. Recovery Queue */}
          <Route path="/recovery" element={<RecoveryDashboard />} />

          {/* 3. Customers */}
          <Route path="/customers" element={<Customers />} />

          {/* 4. Invoices */}
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:id/trashed" element={<InvoiceDetail />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />

          {/* 5. Automation */}
          <Route path="/agent" element={<Agent />} />
          <Route path="/dlq" element={<DLQ />} />

          {/* 6. Workflows & Policy */}
          <Route path="/workflows" element={<WorkflowsPolicy />} />
          <Route path="/policy" element={<WorkflowsPolicy />} />

          {/* 7. Analytics */}
          <Route path="/analytics" element={<Analytics />} />

          {/* 8. Audit & Trust Center */}
          <Route path="/audit" element={<AuditTrustCenter />} />
          <Route path="/trust" element={<AuditTrustCenter />} />

          {/* Role-Guarded Subsystems */}
          <Route element={<ProtectedRoute allowedRoles={['admin', 'manager']} />}>
            <Route path="/disputes" element={<Disputes />} />
            <Route path="/payment-plans" element={<PaymentPlans />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/activity-log" element={<ActivityLog />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
