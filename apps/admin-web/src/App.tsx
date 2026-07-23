import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './pages/AppShell';
import { DispatchHomePage } from './pages/DispatchPages';
import { LiveMapPage } from './pages/LiveMapPage';
import { DriversPage } from './pages/DriversPage';
import { ApplyPage } from './pages/ApplyPage';
import { DriverOffersPage } from './pages/DriverOffersPage';
import { PricingPage } from './pages/PricingPage';
import { ReportsPage } from './pages/ReportsPage';
import { PrivacyPage } from './pages/PrivacyPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/postular" element={<ApplyPage />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route element={<AppShell />}>
            <Route index element={<DispatchHomePage />} />
            <Route path="mapa" element={<LiveMapPage />} />
            <Route path="repartidores" element={<DriversPage />} />
            <Route path="ofertas" element={<DriverOffersPage />} />
            <Route path="tarifas" element={<PricingPage />} />
            <Route path="reportes" element={<ReportsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
