import './env';  // Must be first — loads .env before anything else

import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDb, cleanupStaleSyncs } from './db/queries';

import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import kpiRoutes from './routes/kpis';
import chartRoutes from './routes/charts';
import exportRoutes from './routes/export';
import abcRoutes from './routes/abc';
import insightsRoutes from './routes/insights';
import newTagsRoutes from './routes/newTags';
import syncRoutes from './routes/sync';
import reportRoutes from './routes/reports';
import { initCron } from './services/cronScheduler';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Init database
initDb();

// Cleanup any syncs left "running" from a previous server instance
const staleCount = cleanupStaleSyncs();
if (staleCount > 0) {
  console.log(`[Sync] Cleaned up ${staleCount} stale sync(s) from previous run`);
}

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/charts', chartRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/abc', abcRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/new-tags', newTagsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/reports', reportRoutes);

// Init cron scheduler for ZSBMS sync
initCron();

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(process.cwd(), 'client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🍕 Lupita Dashboard server running on http://localhost:${PORT}`);
});

export default app;
