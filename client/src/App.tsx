import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { FilterProvider } from '@/context/FilterContext';
import { ProtectedLayout } from '@/components/auth/ProtectedLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UploadPage } from '@/pages/UploadPage';
import { ArtigosPage } from '@/pages/ArtigosPage';
import { ABCPage } from '@/pages/ABCPage';
import { InsightsPage } from '@/pages/InsightsPage';
import { HourlyPage } from '@/pages/HourlyPage';
import { InstrucoesPage } from '@/pages/InstrucoesPage';

export default function App() {
  return (
    <AuthProvider>
      <FilterProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* All protected pages share a single Layout instance */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/artigos" element={<ArtigosPage />} />
            <Route path="/abc" element={<ABCPage />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/hourly" element={<HourlyPage />} />
            <Route path="/instrucoes" element={<InstrucoesPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            className: 'font-sans',
          }}
        />
      </FilterProvider>
    </AuthProvider>
  );
}
