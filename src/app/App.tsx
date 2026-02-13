import { useState, useEffect } from 'react';
import { AuthPage } from './components/auth-page';
import { OrganizerDashboard } from './components/organizer-dashboard';
import { StudentDashboard } from './components/student-dashboard';
import { ErrorBoundary } from './components/error-boundary';
import { Toaster } from './components/ui/sonner';
import { getSupabaseClient } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    checkSession();
  }, []);

  const checkSession = async () => {
    const supabase = getSupabaseClient();

    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      // Fetch user info from backend
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/signin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            email: session.user.email,
            password: '' // Session already exists
          })
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          setAccessToken(session.access_token);
        }
      } catch (error) {
        console.error('Error restoring session:', error);
      }
    }

    setLoading(false);
  };

  const handleLogin = (userData: any, token: string) => {
    setUser(userData);
    setAccessToken(token);
  };

  const handleLogout = async () => {
    const supabase = getSupabaseClient();

    await supabase.auth.signOut();
    setUser(null);
    setAccessToken('');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {!user ? (
        <AuthPage onLogin={handleLogin} />
      ) : user.role === 'organizer' ? (
        <ErrorBoundary>
          <OrganizerDashboard user={user} accessToken={accessToken} onLogout={handleLogout} />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary>
          <StudentDashboard user={user} accessToken={accessToken} onLogout={handleLogout} />
        </ErrorBoundary>
      )}
      <Toaster />
    </ErrorBoundary>
  );
}
