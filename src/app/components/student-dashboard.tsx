import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { LogOut, MessageSquare, Users, CheckCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { AIReflection } from './ai-reflection';
import { PeerCritique } from './peer-critique';
import { FeedbackView } from './feedback-view';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface StudentDashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
}

type View = 'sessions' | 'reflection' | 'critique' | 'feedback';

export function StudentDashboard({ user, accessToken, onLogout }: StudentDashboardProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [currentView, setCurrentView] = useState<View>('sessions');
  const [loading, setLoading] = useState(true);
  const [reflection, setReflection] = useState<any>(null);

  useEffect(() => {
    loadActiveSessions();
  }, []);

  const loadActiveSessions = async () => {
    try {
      // Get all sessions - backend filters to show sessions where user is a student
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/sessions`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReflection = async (sessionId: string) => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/reflection/${sessionId}/${user.email}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      if (response.ok && data.reflection) {
        setReflection(data.reflection);
        return data.reflection;
      }
      return null;
    } catch (error) {
      console.error('Error loading reflection:', error);
      return null;
    }
  };

  const selectSession = async (session: any) => {
    setSelectedSession(session);
    await loadReflection(session.id);

    // Determine which view to show
    const reflectionData = await loadReflection(session.id);

    if (reflectionData?.completed) {
      // Reflection is complete, move to critique
      setCurrentView('critique');
    } else if (session.status === 'reflection') {
      setCurrentView('reflection');
    } else if (session.status === 'critique') {
      setCurrentView('critique');
    }
  };

  const handleReflectionComplete = async () => {
    const reflectionData = await loadReflection(selectedSession.id);
    if (reflectionData?.completed) {
      toast.success('Reflection complete! Now you can provide feedback to your peers.');
      setTimeout(() => {
        setCurrentView('critique');
      }, 2000);
    }
  };

  const handleBackToSessions = () => {
    setCurrentView('sessions');
    setSelectedSession(null);
    loadActiveSessions();
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Bold header */}
      <header className="border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold tracking-[0.3em] uppercase text-purple-800 mb-2">
                Student
              </div>
              <h1 className="text-4xl font-black tracking-tight mb-4">
                {user.name}
              </h1>

              {/* Navigation */}
              <div className="flex gap-2">
                {currentView !== 'sessions' && (
                  <Button
                    onClick={handleBackToSessions}
                    variant="outline"
                    className="border-2 border-black hover:bg-black hover:text-white font-bold h-10"
                  >
                    ← Sessions
                  </Button>
                )}
                {currentView === 'critique' && selectedSession && (
                  <Button
                    onClick={() => setCurrentView('feedback')}
                    className="bg-purple-800 hover:bg-purple-900 font-bold h-10"
                  >
                    My Feedback
                  </Button>
                )}
                {currentView === 'feedback' && selectedSession && (
                  <Button
                    onClick={() => setCurrentView('critique')}
                    variant="outline"
                    className="border-2 border-black hover:bg-black hover:text-white font-bold h-10"
                  >
                    ← Critique
                  </Button>
                )}
              </div>
            </div>
            <Button
              onClick={onLogout}
              variant="outline"
              className="border-2 border-black hover:bg-black hover:text-white font-bold"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {currentView === 'sessions' && (
          <>
            <div className="mb-8">
              <h2 className="text-3xl font-black mb-2">Active Crit Sessions</h2>
              <p className="text-lg text-gray-600">Select a session to reflect, critique, and grow</p>
            </div>

            {sessions.length === 0 ? (
              <div className="border-2 border-gray-200 rounded-sm p-16 text-center">
                <div className="inline-block p-4 bg-purple-100 rounded-sm mb-4">
                  <div className="w-12 h-12 bg-purple-800 rounded-sm"></div>
                </div>
                <h3 className="text-2xl font-black mb-2">No active sessions</h3>
                <p className="text-gray-600">Your organizer will add you to a critique session soon</p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {sessions.map((session) => {
                  const hasReflection = reflection?.sessionId === session.id && reflection?.completed;

                  return (
                    <button
                      key={session.id}
                      onClick={() => selectSession(session)}
                      className="text-left border-2 border-black rounded-sm overflow-hidden hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all"
                    >
                      {/* Color bar based on status */}
                      <div className={`h-3 ${
                        session.status === 'reflection' ? 'bg-purple-800' :
                        session.status === 'critique' ? 'bg-orange-500' :
                        'bg-gray-400'
                      }`}></div>

                      <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-xl font-black mb-1">{session.name}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Users className="w-4 h-4" />
                              <span className="font-bold">{session.students?.length || 0}</span> students
                            </div>
                          </div>
                          <div className="px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-sm">
                            {session.status}
                          </div>
                        </div>

                        {session.status === 'reflection' && (
                          <div className={`flex items-center gap-3 p-3 border-2 ${
                            hasReflection ? 'border-green-500 bg-green-50' : 'border-purple-800 bg-purple-50'
                          } rounded-sm`}>
                            {hasReflection ? (
                              <>
                                <CheckCircle className="w-5 h-5 text-green-700 flex-shrink-0" />
                                <span className="text-sm font-bold text-green-700">Reflection Complete</span>
                              </>
                            ) : (
                              <>
                                <MessageSquare className="w-5 h-5 text-purple-800 flex-shrink-0" />
                                <span className="text-sm font-bold text-purple-800">Begin Reflection</span>
                              </>
                            )}
                          </div>
                        )}

                        {session.status === 'critique' && (
                          <div className="flex items-center gap-3 p-3 border-2 border-orange-500 bg-orange-50 rounded-sm">
                            <Users className="w-5 h-5 text-orange-700 flex-shrink-0" />
                            <span className="text-sm font-bold text-orange-700">Provide Feedback</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {currentView === 'reflection' && selectedSession && (
          <AIReflection
            sessionId={selectedSession.id}
            accessToken={accessToken}
            userEmail={user.email}
            onComplete={handleReflectionComplete}
          />
        )}

        {currentView === 'critique' && selectedSession && (
          <PeerCritique
            sessionId={selectedSession.id}
            accessToken={accessToken}
            userEmail={user.email}
            onComplete={() => {
              toast.success('Feedback submitted!');
              setCurrentView('feedback');
            }}
          />
        )}

        {currentView === 'feedback' && selectedSession && (
          <FeedbackView
            sessionId={selectedSession.id}
            accessToken={accessToken}
            userEmail={user.email}
          />
        )}
      </main>
    </div>
  );
}
