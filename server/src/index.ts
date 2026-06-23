import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import campaignRoutes from './routes/campaigns';
import characterRoutes from './routes/characters';
import gameRoutes from './routes/game';
import assetRoutes from './routes/assets';
import ttsRoutes from './routes/tts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Railway/Vercel-style deployments sit behind one trusted reverse proxy.
// This keeps IP-based rate limits accurate for the two real clients.
app.set('trust proxy', 1);

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.CLIENT_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o)) || origin.endsWith('.vercel.app') || origin.endsWith('.everrealm.app') || origin === 'https://everrealm.app') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/tts', ttsRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`D&D RPG Server running on port ${PORT}`);
});

export default app;
