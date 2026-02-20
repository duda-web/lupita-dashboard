import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { FilterProvider } from '@/context/FilterContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UploadPage } from '@/pages/UploadPage';
import { ArtigosPage } from '@/pages/ArtigosPage';
import { ABCPage } from '@/pages/ABCPage';

export default function App() {
  return (
    <AuthProvider>
      <FilterProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <UploadPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/artigos"
            element={
              <ProtectedRoute>
                <ArtigosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/abc"
            element={
              <ProtectedRoute>
                <ABCPage />
              </ProtectedRoute>
            }
          />
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
