import dotenv from 'dotenv';

dotenv.config();

// Validate required environment BEFORE anything imports the Supabase/OpenAI
// clients, which throw cryptically if their keys are missing. A clear, named
// failure in the deploy logs beats a silent "service unavailable" health check.
// Imported first in index.ts so this runs before any client is constructed.
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
] as const;

const missing = REQUIRED_ENV.filter(key => !process.env[key] || !process.env[key]!.trim());

if (missing.length > 0) {
  console.error('\n──────────────────────────────────────────────────────────────');
  console.error(`FATAL: missing required environment variable(s): ${missing.join(', ')}`);
  console.error('Set these on the server host (Railway → Variables), then redeploy.');
  console.error('Note: VITE_* variables are CLIENT (Vercel) vars and do NOT belong on the server.');
  console.error('PORT is provided by the host automatically — you do not need to set it.');
  console.error('──────────────────────────────────────────────────────────────\n');
  process.exit(1);
}
