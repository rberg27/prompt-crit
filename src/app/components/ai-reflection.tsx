import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Upload, Send, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '../../../utils/supabase/info';

interface AIReflectionProps {
  sessionId: string;
  accessToken: string;
  userEmail: string;
  onComplete: () => void;
}

interface Message {
  role: 'ai' | 'user';
  content: string;
}

// Fallback static questions if Claude is unavailable
const FALLBACK_QUESTIONS = [
  {
    question: "Let's start! What is your name and what did you build for this project?",
    followUp: "Tell me more about what motivated you to build this."
  },
  {
    question: "What emotions do you hope people feel when they interact with your project?",
    followUp: "Why are those emotions important to you?"
  },
  {
    question: "What insights did you gather while building this? What surprised you?",
    followUp: "How did those insights change your approach?"
  },
  {
    question: "What did you learn through this process? About the subject? About yourself?",
    followUp: "How might you apply these learnings in the future?"
  },
  {
    question: "What questions do you still have? What would you explore next if you had more time?",
    followUp: "What's holding you back from exploring those questions now?"
  }
];

export function AIReflection({ sessionId, accessToken, userEmail, onComplete }: AIReflectionProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: "Welcome! I'm here to help you reflect on your creative work. Let's have a thoughtful conversation about your project. What is your name, and what did you build?" }
  ]);
  const [currentInput, setCurrentInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [needsFollowUp, setNeedsFollowUp] = useState(false);
  const [responses, setResponses] = useState<any>({});
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [projectSummary, setProjectSummary] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    loadExistingReflection();
  }, []);

  const loadExistingReflection = async () => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/reflection/${sessionId}/${userEmail}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      if (response.ok && data.reflection) {
        setResponses(data.reflection.responses || {});
        setScreenshots(data.reflection.screenshots || []);
        if (data.reflection.completed) {
          setShowSummary(true);
          setProjectSummary(data.reflection.responses?.projectSummary || '');
        }
      }
    } catch (error) {
      console.error('Error loading reflection:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!currentInput.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: currentInput };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);

    // Store response
    const questionKey = `question_${currentQuestionIndex}`;
    const updatedResponses = {
      ...responses,
      [questionKey]: (responses[questionKey] || '') + ' ' + currentInput
    };
    setResponses(updatedResponses);

    // Save progress
    saveReflection(updatedResponses, false);

    setCurrentInput('');
    setIsLoading(true);

    // Try Claude API first, fall back to static if needed
    if (!useFallback) {
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/ai-reflection`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            messages: newMessages,
            sessionId
          })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setMessages([...newMessages, { role: 'ai', content: data.message }]);

          if (data.isComplete) {
            setShowSummary(true);
          }
          setIsLoading(false);
          return;
        } else if (data.fallback) {
          // Switch to fallback mode
          console.log('Switching to fallback mode');
          setUseFallback(true);
        }
      } catch (error) {
        console.error('Claude API error:', error);
        setUseFallback(true);
      }
    }

    // Fallback to static questions
    setIsLoading(false);
    let aiResponse = '';

    if (!needsFollowUp && currentInput.length < 50) {
      aiResponse = FALLBACK_QUESTIONS[currentQuestionIndex].followUp;
      setNeedsFollowUp(true);
    } else if (currentQuestionIndex < FALLBACK_QUESTIONS.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setNeedsFollowUp(false);
      aiResponse = "Thank you for sharing. " + FALLBACK_QUESTIONS[nextIndex].question;
    } else {
      aiResponse = "Thank you for this thoughtful reflection! Now, let's create a visual summary of your project. Please upload 3 screenshots that best represent your work.";
      setShowSummary(true);
    }

    setMessages([...newMessages, { role: 'ai', content: aiResponse }]);
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (screenshots.length + files.length > 3) {
      toast.error('Maximum 3 screenshots allowed');
      return;
    }

    setUploadingScreenshot(true);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId);

        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/upload-screenshot`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData
        });

        const data = await response.json();
        if (response.ok) {
          return data.url;
        } else {
          throw new Error(data.error || 'Upload failed');
        }
      });

      const urls = await Promise.all(uploadPromises);
      const newScreenshots = [...screenshots, ...urls];
      setScreenshots(newScreenshots);

      // Save with screenshots
      saveReflection(responses, false, newScreenshots);

      toast.success('Screenshot uploaded!');
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      toast.error('Failed to upload screenshot');
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const saveReflection = async (currentResponses: any, completed: boolean, currentScreenshots?: string[]) => {
    try {
      await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/reflection/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          responses: currentResponses,
          screenshots: currentScreenshots || screenshots,
          completed
        })
      });
    } catch (error) {
      console.error('Error saving reflection:', error);
    }
  };

  const handleSubmitSummary = async () => {
    if (screenshots.length !== 3) {
      toast.error('Please upload exactly 3 screenshots');
      return;
    }

    if (!projectSummary.trim()) {
      toast.error('Please write a project summary');
      return;
    }

    const finalResponses = {
      ...responses,
      projectSummary,
      name: responses.question_0?.split(' ')[0] || userEmail
    };

    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5742cd96/reflection/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          responses: finalResponses,
          screenshots,
          completed: true
        })
      });

      if (response.ok) {
        toast.success('Reflection complete! Thank you for sharing your insights.');
        onComplete();
      } else {
        toast.error('Failed to submit reflection');
      }
    } catch (error) {
      console.error('Error submitting reflection:', error);
      toast.error('Failed to submit reflection');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI-Guided Reflection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-96 overflow-y-auto space-y-4 p-4 bg-gray-50 rounded-lg">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {!showSummary && (
              <div className="flex gap-2">
                <Input
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                  placeholder={isLoading ? "Thinking..." : "Type your response..."}
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button onClick={handleSendMessage} disabled={isLoading || !currentInput.trim()}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Project Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Upload 3 Screenshots</Label>
              <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="aspect-video border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden"
                  >
                    {screenshots[idx] ? (
                      <img src={screenshots[idx]} alt={`Screenshot ${idx + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center">
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <span className="text-xs text-gray-500">Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleScreenshotUpload}
                          className="hidden"
                          disabled={uploadingScreenshot}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">Project Summary</Label>
              <Textarea
                id="summary"
                value={projectSummary}
                onChange={(e) => setProjectSummary(e.target.value)}
                placeholder="Write a brief summary of your project (2-3 sentences)"
                rows={4}
              />
            </div>

            <Button onClick={handleSubmitSummary} className="w-full" disabled={screenshots.length !== 3 || !projectSummary.trim()}>
              Complete Reflection
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
