import { Router, Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../services/supabase';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(6),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string(),
});

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message || 'Invalid input' });
    return;
  }
  const { username, password } = parse.data;
  const email = `${username.toLowerCase()}@tavern.local`;

  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single();

  if (existing) {
    res.status(409).json({ error: 'Username already taken' });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    res.status(400).json({ error: error?.message || 'Registration failed' });
    return;
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({ id: data.user.id, username });

  if (profileError) {
    res.status(500).json({ error: 'Failed to create profile' });
    return;
  }

  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.session) {
    res.status(500).json({ error: 'Account created but login failed' });
    return;
  }

  res.status(201).json({
    user: { id: data.user.id, username },
    session: signIn.session,
  });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const { username, password } = parse.data;
  const email = `${username.toLowerCase()}@tavern.local`;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', data.user.id)
    .single();

  res.json({
    user: { id: data.user.id, username: profile?.username },
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
