import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ArrowRight } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface AuthPageProps {
  onLogin: (user: any, accessToken: string) => void;
}

export function AuthPage({ onLogin }: AuthPageProps) {
  const [isSignup, setIsSignup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'organizer' | 'student'>('student');

  // Dummy login - bypass authentication for testing
  const handleDummyLogin = (dummyRole: 'organizer' | 'student') => {
    const dummyUser = {
      id: `dummy-${dummyRole}-${Date.now()}`,
      email: `${dummyRole}@demo.com`,
      name: dummyRole === 'organizer' ? 'Demo Organizer' : 'Demo Student',
      role: dummyRole
    };

    // Use a dummy access token for testing
    const dummyToken = `dummy-token-${Date.now()}`;

    onLogin(dummyUser, dummyToken);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ email, password, name, role })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      // Auto-login after signup
      handleSignin(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      onLogin(data.user, data.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Bold color block with typography */}
      <div className="hidden lg:flex lg:w-1/2 bg-purple-800 p-16 flex-col justify-between text-white relative overflow-hidden">
        {/* Large typographic element */}
        <div className="absolute top-0 right-0 text-[20rem] font-black text-purple-700 leading-none select-none opacity-50">
          C
        </div>

        <div className="relative z-10">
          <div className="inline-block mb-3">
            <div className="text-xs font-bold tracking-[0.3em] uppercase text-orange-400 mb-6">
              Wharton Gen AI Studio
            </div>
          </div>
          <h1 className="text-6xl font-black leading-[0.95] mb-6 tracking-tight">
            Artistic<br />
            Critique &<br />
            Feedback
          </h1>
          <p className="text-xl text-purple-200 max-w-md leading-relaxed">
            A parallelized peer critique platform designed for creative projects and deep artistic reflection.
          </p>
        </div>

        <div className="relative z-10">
          <div className="h-1 w-24 bg-orange-500 mb-4"></div>
          <p className="text-sm text-purple-300">
            Where critical thinking meets creative practice
          </p>
        </div>
      </div>

      {/* Right side - Clean form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile header */}
          <div className="lg:hidden mb-8">
            <div className="text-xs font-bold tracking-[0.3em] uppercase text-orange-600 mb-4">
              Wharton Gen AI Studio
            </div>
            <h2 className="text-4xl font-black mb-2">Sign In</h2>
          </div>

          <Tabs value={isSignup ? 'signup' : 'signin'} onValueChange={(v) => setIsSignup(v === 'signup')} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="signin" className="data-[state=active]:bg-purple-800 data-[state=active]:text-white">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="signup" className="data-[state=active]:bg-purple-800 data-[state=active]:text-white">
                Sign Up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-sm uppercase tracking-wider">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="h-12 border-2 border-gray-200 focus:border-purple-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password" className="text-sm uppercase tracking-wider">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="h-12 border-2 border-gray-200 focus:border-purple-800"
                  />
                </div>
                {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
                <Button type="submit" className="w-full h-12 bg-purple-800 hover:bg-purple-900 text-white font-bold" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="text-sm uppercase tracking-wider">Full Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Jane Doe"
                    className="h-12 border-2 border-gray-200 focus:border-purple-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm uppercase tracking-wider">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className="h-12 border-2 border-gray-200 focus:border-purple-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm uppercase tracking-wider">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    minLength={6}
                    className="h-12 border-2 border-gray-200 focus:border-purple-800"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role" className="text-sm uppercase tracking-wider">Role</Label>
                  <select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'organizer' | 'student')}
                    className="w-full h-12 border-2 border-gray-200 rounded-sm px-3 py-2 focus:outline-none focus:border-purple-800 font-medium"
                  >
                    <option value="student">Student</option>
                    <option value="organizer">Organizer</option>
                  </select>
                </div>
                {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
                <Button type="submit" className="w-full h-12 bg-purple-800 hover:bg-purple-900 text-white font-bold" disabled={loading}>
                  {loading ? 'Creating account...' : 'Sign Up'}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Dummy Login Section */}
          <div className="mt-8 pt-8 border-t-2 border-gray-200">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">
              Quick Demo Access
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDummyLogin('organizer')}
                className="h-11 border-2 border-gray-200 hover:border-orange-500 hover:bg-orange-50 font-bold"
              >
                Organizer
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDummyLogin('student')}
                className="h-11 border-2 border-gray-200 hover:border-orange-500 hover:bg-orange-50 font-bold"
              >
                Student
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
