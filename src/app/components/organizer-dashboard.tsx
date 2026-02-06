import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Plus, Users, Play, LogOut, TrendingUp, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface OrganizerDashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
}

export function OrganizerDashboard({ user, accessToken, onLogout }: OrganizerDashboardProps) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [rosterDialogOpen, setRosterDialogOpen] = useState(false);
  const [progressDialogOpen, setProgressDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [sessionName, setSessionName] = useState('');
  const [rosterText, setRosterText] = useState('');
  const [progress, setProgress] = useState<any>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/sessions`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (response.ok) {
        setSessions(data.sessions || []);
      } else {
        console.error('Failed to load sessions:', data.error || 'Unknown error');
        toast.error(data.error || 'Failed to load sessions');
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast.error('Failed to connect to server. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const createSession = async () => {
    if (!sessionName.trim()) {
      toast.error('Please enter a session name');
      return;
    }

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ name: sessionName })
      });

      const data = await response.json();
      if (response.ok) {
        toast.success('Session created!');
        setSessionName('');
        setCreateDialogOpen(false);
        loadSessions();
      } else {
        toast.error(data.error || 'Failed to create session');
      }
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error('Failed to create session');
    }
  };

  const updateRoster = async () => {
    if (!rosterText.trim()) {
      toast.error('Please enter student information');
      return;
    }

    // Parse roster (email, name per line)
    const lines = rosterText.split('\n').filter(l => l.trim());
    const students = lines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      return {
        email: parts[0],
        name: parts[1] || parts[0]
      };
    });

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/session/${selectedSession.id}/roster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ students })
      });

      const data = await response.json();
      if (response.ok) {
        toast.success('Roster updated!');
        setRosterDialogOpen(false);
        loadSessions();
      } else {
        toast.error(data.error || 'Failed to update roster');
      }
    } catch (error) {
      console.error('Error updating roster:', error);
      toast.error('Failed to update roster');
    }
  };

  const startSession = async (session: any) => {
    if (!session.students || session.students.length === 0) {
      toast.error('Please add students to the roster first');
      return;
    }

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/session/${session.id}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        toast.success('Crit session started!');
        loadSessions();
      } else {
        toast.error(data.error || 'Failed to start session');
      }
    } catch (error) {
      console.error('Error starting session:', error);
      toast.error('Failed to start session');
    }
  };

  const viewProgress = async (session: any) => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/session/${session.id}/progress`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        setProgress(data);
        setSelectedSession(session);
        setProgressDialogOpen(true);
      } else {
        toast.error(data.error || 'Failed to load progress');
      }
    } catch (error) {
      console.error('Error loading progress:', error);
      toast.error('Failed to load progress');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      setup: 'secondary',
      reflection: 'default',
      critique: 'default',
      complete: 'default'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Bold header with color block */}
      <header className="border-b-2 border-black">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-xs font-bold tracking-[0.3em] uppercase text-orange-600 mb-2">
                Organizer
              </div>
              <h1 className="text-4xl font-black tracking-tight">
                {user.name}
              </h1>
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

          {/* Action bar */}
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black">Crit Sessions</h2>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-purple-800 hover:bg-purple-900 h-11 font-bold">
                  <Plus className="w-4 h-4 mr-2" />
                  New Session
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black">Create New Session</DialogTitle>
                  <DialogDescription className="text-base">
                    Give your critique session a name
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                  <div>
                    <Label htmlFor="session-name" className="text-sm uppercase tracking-wider">Session Name</Label>
                    <Input
                      id="session-name"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      placeholder="e.g., Spring 2026 Final Projects"
                      className="h-12 border-2 border-gray-200 focus:border-purple-800"
                    />
                  </div>
                  <Button onClick={createSession} className="w-full h-12 bg-purple-800 hover:bg-purple-900 font-bold">
                    Create Session
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {sessions.length === 0 ? (
          <div className="border-2 border-gray-200 rounded-sm p-16 text-center">
            <div className="inline-block p-4 bg-purple-100 rounded-sm mb-4">
              <div className="w-12 h-12 bg-purple-800 rounded-sm"></div>
            </div>
            <h3 className="text-2xl font-black mb-2">No sessions yet</h3>
            <p className="text-gray-600 mb-6">Create your first critique session to get started</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sessions.map((session) => (
              <div key={session.id} className="border-2 border-black rounded-sm overflow-hidden hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] transition-all">
                {/* Color accent bar */}
                <div className={`h-3 ${
                  session.status === 'setup' ? 'bg-gray-400' :
                  session.status === 'reflection' ? 'bg-purple-800' :
                  session.status === 'critique' ? 'bg-orange-500' :
                  'bg-green-500'
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

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-2 border-black hover:bg-black hover:text-white font-bold h-10"
                      onClick={() => {
                        setSelectedSession(session);
                        setRosterDialogOpen(true);
                      }}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Manage Roster
                    </Button>

                    {session.status === 'setup' && (
                      <Button
                        size="sm"
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-10"
                        onClick={() => startSession(session)}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Start Crit
                      </Button>
                    )}

                    {session.status !== 'setup' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full border-2 border-purple-800 text-purple-800 hover:bg-purple-800 hover:text-white font-bold h-10"
                        onClick={() => viewProgress(session)}
                      >
                        <TrendingUp className="w-4 h-4 mr-2" />
                        View Progress
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Roster Dialog */}
      <Dialog open={rosterDialogOpen} onOpenChange={setRosterDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Roster - {selectedSession?.name}</DialogTitle>
            <DialogDescription>
              Enter one student per line in format: email, name
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={rosterText}
              onChange={(e) => setRosterText(e.target.value)}
              placeholder="student1@wharton.upenn.edu, Jane Doe&#10;student2@wharton.upenn.edu, John Smith"
              rows={10}
            />
            <p className="text-sm text-gray-500">
              Example: student@example.com, Student Name
            </p>
            <Button onClick={updateRoster} className="w-full">Update Roster</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Progress Dialog */}
      <Dialog open={progressDialogOpen} onOpenChange={setProgressDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Session Progress - {selectedSession?.name}</DialogTitle>
            <DialogDescription>
              Track student completion and feedback
            </DialogDescription>
          </DialogHeader>
          {progress && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Students</CardDescription>
                    <CardTitle className="text-3xl">{progress.totalStudents}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Reflections Complete</CardDescription>
                    <CardTitle className="text-3xl">{progress.completedReflections}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>Total Feedback</CardDescription>
                    <CardTitle className="text-3xl">{progress.feedbackSubmissions}</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Student</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Reflection</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Feedback Given</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {progress.studentProgress.map((student: any) => (
                      <tr key={student.email}>
                        <td className="px-4 py-2 text-sm">{student.name}</td>
                        <td className="px-4 py-2 text-sm">
                          {student.reflectionComplete ? (
                            <Badge variant="default">Complete</Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">{student.feedbackCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
