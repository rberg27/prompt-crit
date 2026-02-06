import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../utils/supabase/info';

interface PeerCritiqueProps {
  sessionId: string;
  accessToken: string;
  userEmail: string;
  onComplete: () => void;
}

export function PeerCritique({ sessionId, accessToken, userEmail, onComplete }: PeerCritiqueProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [critiques, setCritiques] = useState('');
  const [questions, setQuestions] = useState('');
  const [submittedFeedback, setSubmittedFeedback] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/projects/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        setProjects(data.projects || []);
      } else {
        toast.error(data.error || 'Failed to load projects');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!critiques.trim() && !questions.trim()) {
      toast.error('Please provide either critiques or questions');
      return;
    }

    const currentProject = projects[currentIndex];

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/feedback/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          toStudent: currentProject.studentEmail,
          critiques,
          questions
        })
      });

      if (response.ok) {
        toast.success('Feedback submitted!');
        setSubmittedFeedback(new Set(submittedFeedback).add(currentProject.studentEmail));
        setCritiques('');
        setQuestions('');

        // Move to next project or complete
        if (currentIndex < projects.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          // All feedback submitted
          setTimeout(() => {
            onComplete();
          }, 1000);
        }
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to submit feedback');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast.error('Failed to submit feedback');
    }
  };

  const handleSkip = () => {
    if (currentIndex < projects.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setCritiques('');
      setQuestions('');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <p className="text-gray-500">Loading projects...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-gray-500">No projects available for review yet. Check back once your peers have completed their reflections.</p>
        </CardContent>
      </Card>
    );
  }

  const currentProject = projects[currentIndex];
  const hasSubmitted = submittedFeedback.has(currentProject.studentEmail);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Peer Critique</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            Project {currentIndex + 1} of {projects.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIndex(Math.min(projects.length - 1, currentIndex + 1))}
              disabled={currentIndex === projects.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{currentProject.studentName}'s Project</CardTitle>
              <CardDescription>{currentProject.projectSummary}</CardDescription>
            </div>
            {hasSubmitted && <Badge variant="default">Feedback Submitted</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Screenshots */}
          <div className="grid grid-cols-3 gap-4">
            {currentProject.screenshots?.map((screenshot: string, idx: number) => (
              <div key={idx} className="aspect-video rounded-lg overflow-hidden border border-gray-200">
                <img src={screenshot} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>

          {/* Project Insights */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm text-gray-700">What they shared:</h3>
            <div className="space-y-2 text-sm">
              {currentProject.responses?.question_0 && (
                <p><span className="font-medium">What they built:</span> {currentProject.responses.question_0}</p>
              )}
              {currentProject.responses?.question_1 && (
                <p><span className="font-medium">Intended emotions:</span> {currentProject.responses.question_1}</p>
              )}
              {currentProject.responses?.question_4 && (
                <p><span className="font-medium">Their questions:</span> {currentProject.responses.question_4}</p>
              )}
            </div>
          </div>

          {/* Feedback Form */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-semibold">Provide Your Feedback</h3>

            <div className="space-y-2">
              <Label htmlFor="critiques">Constructive Critiques & Ideas</Label>
              <Textarea
                id="critiques"
                value={critiques}
                onChange={(e) => setCritiques(e.target.value)}
                placeholder="What works well? What could be improved? What ideas do you have?"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="questions">Questions for the Creator</Label>
              <Textarea
                id="questions"
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                placeholder="What questions would help them think deeper about their work?"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmitFeedback} className="flex-1">
                <Send className="w-4 h-4 mr-2" />
                Submit Feedback
              </Button>
              {currentIndex < projects.length - 1 && (
                <Button onClick={handleSkip} variant="outline">
                  Skip
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Progress Indicator */}
      <div className="flex gap-2 justify-center">
        {projects.map((project, idx) => (
          <div
            key={project.studentEmail}
            className={`w-2 h-2 rounded-full ${
              submittedFeedback.has(project.studentEmail)
                ? 'bg-green-500'
                : idx === currentIndex
                ? 'bg-indigo-600'
                : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
