import './env';  // Must be first — loads .env before anything else

import express from 'express';
import cors from 'cors';
import path from 'path';
import { initDb } from './db/queries';

import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import kpiRoutes from './routes/kpis';
import chartRoutes from './routes/charts';
import exportRoutes from './routes/export';
import abcRoutes from './routes/abc';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Init database
initDb();

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
