import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import RequireAuth from './components/RequireAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import OpportunitiesPage from './pages/OpportunitiesPage';
import OpportunityDetailPage from './pages/OpportunityDetailPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TicketsPage from './pages/TicketsPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import { useAuthStore } from './store/authStore';
import { supabase } from './api/supabase';

export default function App() {
  const setSession = useAuthStore((s) => s.setSession);

  // Hydrate auth state from Supabase on mount + listen for changes.
  useEffect(() => {
    if (!supabase) return; // env not configured — skip hydration
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [setSession]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}