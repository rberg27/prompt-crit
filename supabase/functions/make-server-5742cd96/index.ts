import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.ts";

const app = new Hono();

// ===================
// Input Validation Utilities
// ===================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLES = ['organizer', 'student'] as const;
const VALID_SESSION_STATUSES = ['setup', 'reflection', 'critique', 'complete', 'archived'] as const;

function validateEmail(email: unknown): email is string {
  return typeof email === 'string' && EMAIL_REGEX.test(email) && email.length <= 254;
}

function validatePassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function validateRole(role: unknown): role is typeof VALID_ROLES[number] {
  return typeof role === 'string' && VALID_ROLES.includes(role as any);
}

function validateName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length >= 1 && name.length <= 100;
}

function validateSessionName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length >= 1 && name.length <= 200;
}

function validateUUID(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

function validateStudentArray(students: unknown): students is Array<{email: string, name: string}> {
  if (!Array.isArray(students)) return false;
  if (students.length > 500) return false; // Max 500 students per session
  return students.every(s =>
    typeof s === 'object' && s !== null &&
    validateEmail(s.email) &&
    validateName(s.name)
  );
}

function validateTextContent(text: unknown, maxLength = 10000): text is string {
  return typeof text === 'string' && text.length <= maxLength;
}

function sanitizeString(str: string): string {
  return str.trim().slice(0, 10000);
}

// ===================
// Rate Limiting (Simple in-memory)
// ===================

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000);

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Storage bucket name
const bucketName = 'make-5742cd96-screenshots';

// Enable logger
app.use('*', logger(console.log));

// Security headers middleware
app.use('*', async (c, next) => {
  await next();
  // Security headers
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
});

// Rate limiting middleware
app.use('*', async (c, next) => {
  // Use IP or Authorization header as identifier
  const identifier = c.req.header('Authorization')?.slice(0, 50) ||
                     c.req.header('x-forwarded-for') ||
                     'anonymous';

  if (!checkRateLimit(identifier)) {
    return c.json({ error: 'Too many requests. Please try again later.' }, 429);
  }

  await next();
});

// CORS configuration - restrict in production
const allowedOrigins = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || ['*'];

app.use(
  "/*",
  cors({
    origin: (origin) => {
      // In development or if wildcard is set, allow all
      if (allowedOrigins.includes('*')) return origin;
      // Otherwise check against allowed list
      return allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

// Health check endpoint
app.get("/make-server-5742cd96/health", (c) => {
  return c.json({ status: "ok" });
});

// User signup
app.post("/make-server-5742cd96/signup", async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { email, password, name, role } = body;

    // Validate email
    if (!validateEmail(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Validate password
    if (!validatePassword(password)) {
      return c.json({ error: 'Password must be between 6 and 128 characters' }, 400);
    }

    // Validate name
    if (!validateName(name)) {
      return c.json({ error: 'Name must be between 1 and 100 characters' }, 400);
    }

    // Validate role
    if (!validateRole(role)) {
      return c.json({ error: 'Role must be "organizer" or "student"' }, 400);
    }

    // Check if user already exists
    const existingUser = await kv.get(`user:${email}`);
    if (existingUser) {
      return c.json({ error: 'User already exists' }, 400);
    }

    // Create user in Supabase Auth
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      user_metadata: { name: sanitizeString(name), role },
      email_confirm: true
    });

    if (error) {
      console.log('Supabase auth error during signup:', error);
      return c.json({ error: error.message }, 400);
    }

    // Store user info in KV
    const sanitizedName = sanitizeString(name);
    await kv.set(`user:${email.toLowerCase()}`, {
      email: email.toLowerCase(),
      name: sanitizedName,
      role,
      userId: data.user.id
    });

    return c.json({ success: true, user: { email: email.toLowerCase(), name: sanitizedName, role } });
  } catch (error) {
    console.log('Error during signup:', error);
    return c.json({ error: 'Signup failed' }, 500);
  }
});

// User signin
app.post("/make-server-5742cd96/signin", async (c) => {
  try {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { email, password } = body;

    // Validate email format
    if (!validateEmail(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Basic password check (don't reveal if account exists)
    if (typeof password !== 'string' || password.length === 0) {
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    const authSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const { data, error } = await authSupabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error) {
      console.log('Supabase auth error during signin:', error);
      // Generic error to prevent user enumeration
      return c.json({ error: 'Invalid credentials' }, 401);
    }

    // Get user info from KV
    const userInfo = await kv.get(`user:${email.toLowerCase()}`);

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
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { name } = body;

    // Validate session name
    if (!validateSessionName(name)) {
      return c.json({ error: 'Session name must be between 1 and 200 characters' }, 400);
    }

    const sessionId = crypto.randomUUID();

    const session = {
      id: sessionId,
      organizerId: user.id,
      organizerEmail: user.email,
      name: sanitizeString(name),
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
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const allSessions = await kv.getByPrefix('session:');

    // Return sessions where user is either organizer OR a student
    const userSessions = allSessions.filter(s =>
      s.organizerId === user.id ||
      s.students?.some((student: any) => student.email?.toLowerCase() === user.email?.toLowerCase())
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
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { students } = body;

    // Validate students array
    if (!validateStudentArray(students)) {
      return c.json({ error: 'Invalid students array. Each student must have valid email and name.' }, 400);
    }

    const session = await kv.get(`session:${sessionId}`);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    // Sanitize student data
    session.students = students.map((s: any) => ({
      email: s.email.toLowerCase().trim(),
      name: sanitizeString(s.name)
    }));
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
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (session.status !== 'setup') {
      return c.json({ error: 'Session must be in setup phase to start' }, 400);
    }

    session.status = 'reflection';
    session.startedAt = new Date().toISOString();
    await kv.set(`session:${sessionId}`, session);

    return c.json({ success: true, session });
  } catch (error) {
    console.log('Error starting session:', error);
    return c.json({ error: 'Failed to start session' }, 500);
  }
});

// Advance session to critique phase
app.post("/make-server-5742cd96/session/:id/advance", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (session.status !== 'reflection') {
      return c.json({ error: 'Session must be in reflection phase to advance' }, 400);
    }

    session.status = 'critique';
    session.advancedAt = new Date().toISOString();
    await kv.set(`session:${sessionId}`, session);

    return c.json({ success: true, session });
  } catch (error) {
    console.log('Error advancing session:', error);
    return c.json({ error: 'Failed to advance session' }, 500);
  }
});

// Complete session
app.post("/make-server-5742cd96/session/:id/complete", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (session.status !== 'critique') {
      return c.json({ error: 'Session must be in critique phase to complete' }, 400);
    }

    session.status = 'complete';
    session.completedAt = new Date().toISOString();
    await kv.set(`session:${sessionId}`, session);

    return c.json({ success: true, session });
  } catch (error) {
    console.log('Error completing session:', error);
    return c.json({ error: 'Failed to complete session' }, 500);
  }
});

// Reopen completed session
app.post("/make-server-5742cd96/session/:id/reopen", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { phase } = body;

    // Validate phase
    if (phase && phase !== 'reflection' && phase !== 'critique') {
      return c.json({ error: 'Phase must be "reflection" or "critique"' }, 400);
    }

    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    if (session.status !== 'complete' && session.status !== 'archived') {
      return c.json({ error: 'Session must be complete or archived to reopen' }, 400);
    }

    session.status = phase === 'reflection' ? 'reflection' : 'critique';
    session.reopenedAt = new Date().toISOString();
    await kv.set(`session:${sessionId}`, session);

    return c.json({ success: true, session });
  } catch (error) {
    console.log('Error reopening session:', error);
    return c.json({ error: 'Failed to reopen session' }, 500);
  }
});

// Archive session
app.post("/make-server-5742cd96/session/:id/archive", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (session.organizerId !== user.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    session.status = 'archived';
    session.archivedAt = new Date().toISOString();
    await kv.set(`session:${sessionId}`, session);

    return c.json({ success: true, session });
  } catch (error) {
    console.log('Error archiving session:', error);
    return c.json({ error: 'Failed to archive session' }, 500);
  }
});

// Get session details
app.get("/make-server-5742cd96/session/:id", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    const session = await kv.get(`session:${sessionId}`);

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Check if user has access (organizer or student in session)
    const isOrganizer = session.organizerId === user.id;
    const isStudent = session.students?.some((s: any) => s.email === user.email);

    if (!isOrganizer && !isStudent) {
      return c.json({ error: 'Forbidden' }, 403);
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
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id || !user?.email) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { responses, screenshots, completed } = body;

    // Validate responses object
    if (responses && typeof responses !== 'object') {
      return c.json({ error: 'Responses must be an object' }, 400);
    }

    // Validate screenshots array
    if (screenshots && (!Array.isArray(screenshots) || screenshots.length > 10)) {
      return c.json({ error: 'Screenshots must be an array with max 10 items' }, 400);
    }

    // Verify session exists and user is a student in it
    const session = await kv.get(`session:${sessionId}`);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const isStudent = session.students?.some((s: any) => s.email === user.email);
    if (!isStudent) {
      return c.json({ error: 'Forbidden - not enrolled in session' }, 403);
    }

    // Sanitize responses
    const sanitizedResponses: Record<string, string> = {};
    if (responses) {
      for (const [key, value] of Object.entries(responses)) {
        if (typeof value === 'string') {
          sanitizedResponses[key] = sanitizeString(value);
        }
      }
    }

    const reflection = {
      sessionId,
      studentEmail: user.email,
      responses: sanitizedResponses,
      screenshots: screenshots || [],
      completed: completed === true,
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
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    const email = c.req.param('email');
    if (!validateEmail(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Verify user has access to this reflection
    const session = await kv.get(`session:${sessionId}`);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const isOrganizer = session.organizerId === user.id;
    const isOwnReflection = user.email === email;
    const isInSession = session.students?.some((s: any) => s.email === user.email);

    // Only organizer, the student themselves, or other students in the session (for peer review) can access
    if (!isOrganizer && !isOwnReflection && !isInSession) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const reflection = await kv.get(`reflection:${sessionId}:${email}`);

    return c.json({ reflection });
  } catch (error) {
    console.log('Error fetching reflection:', error);
    return c.json({ error: 'Failed to fetch reflection' }, 500);
  }
});

// Upload screenshot
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

app.post("/make-server-5742cd96/upload-screenshot", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id || !user?.email) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let formData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: 'Invalid form data' }, 400);
    }

    const file = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!file || !sessionId) {
      return c.json({ error: 'Missing file or sessionId' }, 400);
    }

    // Validate session ID
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: 'File too large. Maximum size is 10MB.' }, 400);
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return c.json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' }, 400);
    }

    // Verify session exists and user is enrolled
    const session = await kv.get(`session:${sessionId}`);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const isStudent = session.students?.some((s: any) => s.email === user.email);
    if (!isStudent) {
      return c.json({ error: 'Forbidden - not enrolled in session' }, 403);
    }

    // Sanitize filename - remove path traversal attempts
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 100);
    const fileName = `${sessionId}/${user.email}/${crypto.randomUUID()}-${sanitizedName}`;
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
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    // Verify session exists and user has access
    const session = await kv.get(`session:${sessionId}`);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const isOrganizer = session.organizerId === user.id;
    const isStudent = session.students?.some((s: any) => s.email === user.email);

    if (!isOrganizer && !isStudent) {
      return c.json({ error: 'Forbidden' }, 403);
    }

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
    if (!accessToken) {
      return c.json({ error: 'Missing access token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError) {
      console.log('Auth error in feedback:', authError);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!user?.id || !user?.email) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { toStudent, critiques, questions } = body;

    // Validate toStudent email
    if (!validateEmail(toStudent)) {
      return c.json({ error: 'Invalid toStudent email format' }, 400);
    }

    // Prevent self-feedback
    if (toStudent.toLowerCase() === user.email.toLowerCase()) {
      return c.json({ error: 'Cannot submit feedback to yourself' }, 400);
    }

    // Validate feedback content
    if (!validateTextContent(critiques, 5000)) {
      return c.json({ error: 'Critiques must be under 5000 characters' }, 400);
    }

    if (!validateTextContent(questions, 2000)) {
      return c.json({ error: 'Questions must be under 2000 characters' }, 400);
    }

    // Verify session exists and user is enrolled
    const session = await kv.get(`session:${sessionId}`);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const isStudent = session.students?.some((s: any) => s.email === user.email);
    if (!isStudent) {
      return c.json({ error: 'Forbidden - not enrolled in session' }, 403);
    }

    // Verify target student is in the session
    const targetInSession = session.students?.some((s: any) => s.email === toStudent.toLowerCase());
    if (!targetInSession) {
      return c.json({ error: 'Target student not found in session' }, 400);
    }

    const feedback = {
      sessionId,
      fromStudent: user.email,
      toStudent: toStudent.toLowerCase(),
      critiques: sanitizeString(critiques || ''),
      questions: sanitizeString(questions || ''),
      createdAt: new Date().toISOString()
    };

    const kvKey = `feedback:${sessionId}:${user.email}:${toStudent.toLowerCase()}`;
    console.log('Saving feedback with key:', kvKey);

    await kv.set(kvKey, feedback);

    return c.json({ success: true, feedback });
  } catch (error: any) {
    console.log('Error submitting feedback:', error?.message || error);
    return c.json({ error: 'Failed to submit feedback' }, 500);
  }
});

// Get all feedback for a student
app.get("/make-server-5742cd96/feedback/:sessionId/:studentEmail", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('sessionId');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    const studentEmail = c.req.param('studentEmail');
    if (!validateEmail(studentEmail)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    const session = await kv.get(`session:${sessionId}`);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // Only allow users to view their own feedback or organizer to view all
    const isOrganizer = session.organizerId === user.id;
    const isOwnFeedback = user.email?.toLowerCase() === studentEmail.toLowerCase();

    if (!isOrganizer && !isOwnFeedback) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const allFeedback = await kv.getByPrefix(`feedback:${sessionId}:`);
    const studentFeedback = allFeedback.filter(f => f.toStudent?.toLowerCase() === studentEmail.toLowerCase());

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
    if (!accessToken) {
      return c.json({ error: 'Missing authorization token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const sessionId = c.req.param('id');
    if (!validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

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
      totalStudents: session.students?.length || 0,
      completedReflections: completedReflections.length,
      feedbackSubmissions: allFeedback.length,
      studentProgress: (session.students || []).map((s: any) => ({
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

// AI Reflection - Claude-powered conversation
const REFLECTION_SYSTEM_PROMPT = "You are a thoughtful facilitator guiding a student through reflecting on their creative project. Be warm, curious, and concise (2-3 sentences max). Guide them through: 1) What they built and why, 2) Emotions they want to evoke, 3) Insights and surprises, 4) What they learned, 5) Remaining questions. If responses are brief, ask them to elaborate. Acknowledge what they share before moving on. After covering all 5 areas, summarize and end with [REFLECTION_COMPLETE]. Never break character.";

const MAX_MESSAGES = 50; // Max conversation length
const MAX_MESSAGE_LENGTH = 2000; // Max characters per message

app.post("/make-server-5742cd96/ai-reflection", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'Missing access token' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user?.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { messages, sessionId } = body;

    // Validate messages array
    if (!messages || !Array.isArray(messages)) {
      return c.json({ error: 'Messages array required' }, 400);
    }

    if (messages.length > MAX_MESSAGES) {
      return c.json({ error: `Too many messages. Maximum is ${MAX_MESSAGES}` }, 400);
    }

    // Validate each message
    for (const msg of messages) {
      if (typeof msg !== 'object' || !msg.role || !msg.content) {
        return c.json({ error: 'Each message must have role and content' }, 400);
      }
      if (typeof msg.content !== 'string' || msg.content.length > MAX_MESSAGE_LENGTH) {
        return c.json({ error: `Message content must be under ${MAX_MESSAGE_LENGTH} characters` }, 400);
      }
      if (!['user', 'ai', 'assistant'].includes(msg.role)) {
        return c.json({ error: 'Message role must be "user" or "ai"' }, 400);
      }
    }

    // Validate sessionId if provided
    if (sessionId && !validateUUID(sessionId)) {
      return c.json({ error: 'Invalid session ID format' }, 400);
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return c.json({ error: 'AI service not configured', fallback: true }, 500);
    }

    // Convert messages to Anthropic format and sanitize
    const anthropicMessages = messages.map((msg: any) => ({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: sanitizeString(msg.content)
    }));

    // Call Claude API
    const requestBody = {
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      system: REFLECTION_SYSTEM_PROMPT,
      messages: anthropicMessages
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Claude API error status:', response.status);
      return c.json({ error: 'AI service error', fallback: true }, 500);
    }

    const data = await response.json();
    const aiResponse = data.content?.[0]?.text || '';
    const isComplete = aiResponse.includes('[REFLECTION_COMPLETE]');
    const cleanResponse = aiResponse.replace('[REFLECTION_COMPLETE]', '').trim();

    return c.json({
      success: true,
      message: cleanResponse,
      isComplete
    });
  } catch (error: any) {
    console.log('Error in AI reflection:', error?.message);
    return c.json({
      error: 'AI reflection failed',
      fallback: true
    }, 500);
  }
});

Deno.serve(app.fetch);
