import { Router, Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../services/supabase';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { email, password, username } = parse.data;

  // Check username availability
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single();

  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    res.status(400).json({ error: error?.message || 'Registration failed' });
    return;
  }

  // Create profile
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({ id: data.user.id, username });

  if (profileError) {
    res.status(500).json({ error: 'Failed to create profile' });
    return;
  }

  res.status(201).json({
    user: { id: data.user.id, email: data.user.email, username },
    session: data.session,
  });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors });
    return;
  }
  const { email, password } = parse.data;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', data.user.id)
    .single();

  res.json({
    user: { id: data.user.id, email: data.user.email, username: profile?.username },
    session: data.session,
  });
});

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const token = req.headers.authorization?.slice(7);
  if (token) {
    await supabase.auth.signOut();
  }
  res.json({ message: 'Logged out' });
});

export default router;
