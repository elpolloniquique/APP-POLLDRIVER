import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { InstallPrompt } from './components/InstallPrompt';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DriverOnboardingPage } from './pages/DriverOnboardingPage';
import { AppShell } from './pages/AppShell';
import { DispatchHomePage } from './pages/DispatchPages';
import { LiveMapPage } from './pages/LiveMapPage';
import { DriversPage } from './pages/DriversPage';
import { DriverOffersPage } from './pages/DriverOffersPage';
import { DriverHomePage } from './pages/DriverHomePage';
import { DriverHistoryPage } from './pages/DriverHistoryPage';
import { DriverEarningsPage } from './pages/DriverEarningsPage';
import { DriverProfilePage } from './pages/DriverProfilePage';
import { PricingPage } from './pages/PricingPage';
import { ReportsPage } from './pages/ReportsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <InstallPrompt />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route path="/onboarding" element={<DriverOnboardingPage />} />
          <Route path="/postular" element={<Navigate to="/registro" replace />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route element={<AppShell />}>
            <Route index element={<DispatchHomePage />} />
            <Route path="mapa" element={<LiveMapPage />} />
            <Route path="repartidores" element={<DriversPage />} />
            <Route path="ofertas" element={<DriverOffersPage />} />
            <Route path="driver/mapa" element={<DriverHomePage />} />
            <Route path="driver/historial" element={<DriverHistoryPage />} />
            <Route path="driver/ingresos" element={<DriverEarningsPage />} />
            <Route path="driver/perfil" element={<DriverProfilePage />} />
            <Route path="tarifas" element={<PricingPage />} />
            <Route path="reportes" element={<ReportsPage />} />
            <Route path="configuracion" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
