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
import { fetchProfile, supabase } from './api/supabase';

export default function App() {
  const setSession = useAuthStore((s) => s.setSession);
  const setProfile = useAuthStore((s) => s.setProfile);

  // Hydrate auth state from Supabase on mount + listen for changes.
  // On every session change, also fetch the matching profile row so
  // Layout / RoleGate / pages can read role without an extra round-trip.
  useEffect(() => {
    if (!supabase) return; // env not configured — skip hydration
    const loadProfile = (userId: string | undefined) => {
      if (!userId) {
        setProfile(null);
        return;
      }
      fetchProfile(userId).then(setProfile).catch(() => setProfile(null));
    };
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session?.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      loadProfile(session?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [setSession, setProfile]);

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