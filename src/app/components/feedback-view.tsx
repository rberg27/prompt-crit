import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { MessageSquare, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../utils/supabase/info';

interface FeedbackViewProps {
  sessionId: string;
  accessToken: string;
  userEmail: string;
}

export function FeedbackView({ sessionId, accessToken, userEmail }: FeedbackViewProps) {
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeedback();
  }, []);

  const loadFeedback = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/feedback/${sessionId}/${userEmail}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      if (response.ok) {
        setFeedback(data.feedback || []);
      } else {
        toast.error(data.error || 'Failed to load feedback');
      }
    } catch (error) {
      console.error('Error loading feedback:', error);
      toast.error('Failed to load feedback');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <p className="text-gray-500">Loading feedback...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Your Peer Feedback</h2>
        <p className="text-gray-600">See what your peers thought about your project</p>
      </div>

      {feedback.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">No feedback yet. Your peers are still reviewing projects.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {feedback.map((fb, idx) => (
            <Card key={idx} className="border-l-4 border-l-indigo-600">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Feedback from Peer {idx + 1}</CardTitle>
                  <Badge variant="secondary">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {fb.critiques && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <MessageSquare className="w-4 h-4" />
                      Critiques & Ideas
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm whitespace-pre-wrap">{fb.critiques}</p>
                    </div>
                  </div>
                )}

                {fb.questions && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <HelpCircle className="w-4 h-4" />
                      Questions to Consider
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm whitespace-pre-wrap">{fb.questions}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {feedback.length > 0 && (
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
          <CardHeader>
            <CardTitle className="text-lg">Reflection Prompts</CardTitle>
            <CardDescription>Consider these questions as you review the feedback</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>• What patterns do you notice across the feedback?</p>
            <p>• Which suggestions resonate most with your vision?</p>
            <p>• What new perspectives did your peers offer?</p>
            <p>• How might you iterate on your project based on this feedback?</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
