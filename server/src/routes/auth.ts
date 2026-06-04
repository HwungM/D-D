import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../services/supabase';
import { z } from 'zod';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().optional(),
});

async function getOrCreateUser(username: string): Promise<{ id: string; username: string; session: object } | { error: string }> {
  const email = `${username.toLowerCase()}@tavern.local`;

  // Find existing user by listing and filtering (admin API)
  const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return { error: 'Auth service error' };

  const existing = listData.users.find(u => u.email === email);

  let userId: string;

  if (existing) {
    userId = existing.id;
  } else {
    // Create new user
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'tavern2024',
      email_confirm: true,
    });
    if (createError || !created.user) return { error: createError?.message || 'Failed to create user' };
    userId = created.user.id;

    // Create profile
    await supabaseAdmin.from('profiles').insert({ id: userId, username });
  }

  // Ensure profile exists
  const { data: profile } = await supabaseAdmin.from('profiles').select('username').eq('id', userId).single();
  if (!profile) {
    await supabaseAdmin.from('profiles').upsert({ id: userId, username });
  }

  // Create session via admin (no password needed)
  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.createSession({ userId });
  if (sessionError || !sessionData.session) return { error: 'Failed to create session' };

  return { id: userId, username, session: sessionData.session };
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parse = z.object({ username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/), password: z.string() }).safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.errors[0]?.message || 'Invalid input' });
    return;
  }
  const result = await getOrCreateUser(parse.data.username);
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json({ user: { id: result.id, username: result.username }, session: result.session });
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }
  const result = await getOrCreateUser(parse.data.username);
  if ('error' in result) {
    res.status(401).json({ error: result.error });
    return;
  }
  res.json({ user: { id: result.id, username: result.username }, session: result.session });
});

router.post('/logout', async (_req: Request, res: Response): Promise<void> => {
  res.json({ message: 'Logged out' });
});

export default router;
