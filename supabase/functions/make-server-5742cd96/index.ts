import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";

const app = new Hono();

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Storage bucket name
const bucketName = 'make-5742cd96-screenshots';

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-5742cd96/health", (c) => {
  return c.json({ status: "ok" });
});

// User signup
app.post("/make-server-5742cd96/signup", async (c) => {
  try {
    const { email, password, name, role } = await c.req.json();

    if (!email || !password || !name || !role) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Check if user already exists
    const existingUser = await kv.get(`user:${email}`);
    if (existingUser) {
      return c.json({ error: 'User already exists' }, 400);
    }

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role },
      email_confirm: true
    });

    if (error) {
      console.log('Supabase auth error during signup:', error);
      return c.json({ error: error.message }, 400);
    }

    // Store user info in KV
    await kv.set(`user:${email}`, { email, name, role, userId: data.user.id });

    return c.json({ success: true, user: { email, name, role } });
  } catch (error) {
    console.log('Error during signup:', error);
    return c.json({ error: 'Signup failed' }, 500);
  }
});

// User signin
app.post("/make-server-5742cd96/signin", async (c) => {
  try {
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: 'Missing email or password' }, 400);
    }

    const authSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const { data, error } = await authSupabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log('Supabase auth error during signin:', error);
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Get user info from KV
    const userInfo = await kv.get(`user:${email}`);

    return c.json({
      success: true,
      accessToken: data.session.access_token,
      user: userInfo
    });
  } catch (error) {
    console.log('Error during signin:', error);
    return c.json({ error: 'Signin failed' }, 500);
  }
});

// Create new crit session (organizer only)
app.post("/make-server-5742cd96/session", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { name } = await c.req.json();
    const sessionId = crypto.randomUUID();

    const session = {
      id: sessionId,
      organizerId: user.id,
      organizerEmail: user.email,
      name,
      status: 'setup',
      students: [],
      createdAt: new Date().toISOString()
    };

    await kv.set(`session:${sessionId}`, session);

    return c.json({ success: true, session });
  } catch (error) {
    console.log('Error creating session:', error);
    return c.json({ error: 'Failed to create session' }, 500);
  }
});

// Get all sessions for organizer
app.get("/make-server-5742cd96/sessions", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allSessions = await kv.getByPrefix('session:');

    // Return sessions where user is either organizer OR a student
    const userSessions = allSessions.filter(s =>
      s.organizerId === user.id ||
      s.students?.some((student: any) => student.email === user.email)
    );

    return c.json({ sessions: userSessions });
  } catch (error) {
    console.log('Error fetching sessions:', error);
    return c.json({ error: 'Failed to fetch sessions' }, 500);
  }
});

// Add students to roster
app.post("/make-server-5742cd96/session/:id/roster", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    const { students } = await c.req.json();

    const session = await kv.get(`session:${sessionId}`);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    session.students = students;
    await kv.set(`session:${sessionId}`, session);

    return c.json({ success: true, session });
  } catch (error) {
    console.log('Error updating roster:', error);
    return c.json({ error: 'Failed to update roster' }, 500);
  }
});

// Start crit process
app.post("/make-server-5742cd96/session/:id/start", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    session.status = 'reflection';
    await kv.set(`session:${sessionId}`, session);

    return c.json({ success: true, session });
  } catch (error) {
    console.log('Error starting session:', error);
    return c.json({ error: 'Failed to start session' }, 500);
  }
});

// Get session details
app.get("/make-server-5742cd96/session/:id", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    return c.json({ session });
  } catch (error) {
    console.log('Error fetching session:', error);
    return c.json({ error: 'Failed to fetch session' }, 500);
  }
});

// Save student reflection
app.post("/make-server-5742cd96/reflection/:sessionId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    const { responses, screenshots, completed } = await c.req.json();

    const reflection = {
      sessionId,
      studentEmail: user.email,
      responses,
      screenshots: screenshots || [],
      completed: completed || false,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`reflection:${sessionId}:${user.email}`, reflection);

    return c.json({ success: true, reflection });
  } catch (error) {
    console.log('Error saving reflection:', error);
    return c.json({ error: 'Failed to save reflection' }, 500);
  }
});

// Get student reflection
app.get("/make-server-5742cd96/reflection/:sessionId/:email", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    const email = c.req.param('email');

    const reflection = await kv.get(`reflection:${sessionId}:${email}`);

    return c.json({ reflection });
  } catch (error) {
    console.log('Error fetching reflection:', error);
    return c.json({ error: 'Failed to fetch reflection' }, 500);
  }
});

// Upload screenshot
app.post("/make-server-5742cd96/upload-screenshot", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!file || !sessionId) {
      return c.json({ error: 'Missing file or sessionId' }, 400);
    }

    const fileName = `${sessionId}/${user.email}/${crypto.randomUUID()}-${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false
      });

    if (error) {
      console.log('Storage upload error:', error);
      return c.json({ error: 'Failed to upload file' }, 500);
    }

    // Get signed URL
    const { data: signedUrlData } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    return c.json({ success: true, url: signedUrlData?.signedUrl, path: fileName });
  } catch (error) {
    console.log('Error uploading screenshot:', error);
    return c.json({ error: 'Failed to upload screenshot' }, 500);
  }
});

// Get all completed projects for peer review
app.get("/make-server-5742cd96/projects/:sessionId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    const allReflections = await kv.getByPrefix(`reflection:${sessionId}:`);

    const completedProjects = allReflections
      .filter(r => r.completed && r.studentEmail !== user.email)
      .map(r => ({
        studentEmail: r.studentEmail,
        studentName: r.responses?.name || r.studentEmail,
        projectSummary: r.responses?.projectSummary || '',
        screenshots: r.screenshots || [],
        responses: r.responses
      }));

    return c.json({ projects: completedProjects });
  } catch (error) {
    console.log('Error fetching projects:', error);
    return c.json({ error: 'Failed to fetch projects' }, 500);
  }
});

// Submit peer feedback
app.post("/make-server-5742cd96/feedback/:sessionId", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    const { toStudent, critiques, questions } = await c.req.json();

    const feedback = {
      sessionId,
      fromStudent: user.email,
      toStudent,
      critiques,
      questions,
      createdAt: new Date().toISOString()
    };

    await kv.set(`feedback:${sessionId}:${user.email}:${toStudent}`, feedback);

    return c.json({ success: true, feedback });
  } catch (error) {
    console.log('Error submitting feedback:', error);
    return c.json({ error: 'Failed to submit feedback' }, 500);
  }
});

// Get all feedback for a student
app.get("/make-server-5742cd96/feedback/:sessionId/:studentEmail", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    const studentEmail = c.req.param('studentEmail');

    // Only allow users to view their own feedback or organizer to view all
    if (user.email !== studentEmail) {
      const session = await kv.get(`session:${sessionId}`);
      if (session?.organizerId !== user.id) {
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    const allFeedback = await kv.getByPrefix(`feedback:${sessionId}:`);
    const studentFeedback = allFeedback.filter(f => f.toStudent === studentEmail);

    return c.json({ feedback: studentFeedback });
  } catch (error) {
    console.log('Error fetching feedback:', error);
    return c.json({ error: 'Failed to fetch feedback' }, 500);
  }
});

// Get session progress (for organizer dashboard)
app.get("/make-server-5742cd96/session/:id/progress", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (!user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const allReflections = await kv.getByPrefix(`reflection:${sessionId}:`);
    const completedReflections = allReflections.filter(r => r.completed);

    const allFeedback = await kv.getByPrefix(`feedback:${sessionId}:`);

    // Count feedback submitted by each student
    const feedbackCount: Record<string, number> = {};
    allFeedback.forEach((f: any) => {
      feedbackCount[f.fromStudent] = (feedbackCount[f.fromStudent] || 0) + 1;
    });

    return c.json({
      totalStudents: session.students.length,
      completedReflections: completedReflections.length,
      feedbackSubmissions: allFeedback.length,
      studentProgress: session.students.map((s: any) => ({
        email: s.email,
        name: s.name,
        reflectionComplete: allReflections.some((r: any) => r.studentEmail === s.email && r.completed),
        feedbackCount: feedbackCount[s.email] || 0
      }))
    });
  } catch (error) {
    console.log('Error fetching progress:', error);
    return c.json({ error: 'Failed to fetch progress' }, 500);
  }
});

Deno.serve(app.fetch);
