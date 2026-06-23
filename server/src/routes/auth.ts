import { Router, Request, Response } from 'express';
import { supabase, supabaseAdmin } from '../services/supabase';
import { z } from 'zod';
import { authRateLimit } from '../middleware/rateLimit';

const router = Router();

const TAVERN_PASSWORD = 'tavern2024';

async function getOrCreateUser(username: string): Promise<{ id: string; username: string; session: object } | { error: string }> {
  const email = `${username.toLowerCase()}@tavern.local`;

  // Find existing user
  const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) return { error: 'Auth service error' };

  const existing = listData.users.find(u => u.email === email);

  if (existing) {
    // Reset password to known value so signInWithPassword works
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: TAVERN_PASSWORD,
    });
    if (updateError) return { error: 'Failed to reset credentials' };
  } else {
    // Create new user
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: TAVERN_PASSWORD,
      email_confirm: true,
    });
    if (createError || !created.user) return { error: createError?.message || 'Failed to create user' };

    await supabaseAdmin.from('profiles').insert({ id: created.user.id, username });
  }

  // Sign in with known password
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password: TAVERN_PASSWORD });
  if (signInError || !signIn.session) return { error: 'Login failed after credential reset' };

  // Ensure profile exists
  const { data: profile } = await supabaseAdmin.from('profiles').select('username').eq('id', signIn.user.id).single();
  if (!profile) {
    await supabaseAdmin.from('profiles').upsert({ id: signIn.user.id, username });
  }

  return { id: signIn.user.id, username, session: signIn.session };
}

router.post('/register', authRateLimit, async (req: Request, res: Response): Promise<void> => {
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

router.post('/login', authRateLimit, async (req: Request, res: Response): Promise<void> => {
  const parse = z.object({ username: z.string().min(1), password: z.string().optional() }).safeParse(req.body);
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
