import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { db } from './src/db/index.ts';
import { users, citizenReports, trafficIncidents } from './src/db/schema.ts';
import { requireAuth, optionalAuth, type AuthenticatedRequest } from './src/middleware/auth.ts';
import { desc, eq } from 'drizzle-orm';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function startYoloService() {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const child = spawn(python, ['yolo_service.py'], {
    cwd: __dirname,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, YOLO_PORT: process.env.YOLO_PORT || '8001' },
  });
  child.on('error', (err) => {
    console.warn('YOLO service failed to start:', err.message);
  });
  child.on('exit', (code) => {
    if (code) console.warn('YOLO service exited with code', code);
  });
  return child;
}

function proxyYolo(req: express.Request, res: express.Response) {
  const yoloPort = process.env.YOLO_PORT ? parseInt(process.env.YOLO_PORT, 10) : 8001;
  const targetPath = req.originalUrl.replace(/^\/api\/yolo/, '') || '/health';
  const headers = { ...req.headers, host: `127.0.0.1:${yoloPort}` };
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: yoloPort,
      path: targetPath,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.status(503).json({ ok: false, error: 'YOLO service offline', yolo: false });
    }
  });
  req.pipe(upstream);
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  startYoloService();

  app.use('/api/yolo', (req, res) => {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      return res.status(204).end();
    }
    return proxyYolo(req, res);
  });

  app.use(express.json({ limit: '10mb' }));

  // API Routes
  // Sync authenticated user to Cloud SQL database
  app.post('/api/auth/sync-user', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const { displayName, photoUrl } = req.body;

      const existingUser = await db.select().from(users).where(eq(users.id, user.uid)).limit(1);

      if (existingUser.length > 0) {
        await db
          .update(users)
          .set({
            email: user.email || null,
            displayName: displayName || user.name || null,
            photoUrl: photoUrl || user.picture || null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.uid));
      } else {
        await db.insert(users).values({
          id: user.uid,
          email: user.email || null,
          displayName: displayName || user.name || null,
          photoUrl: photoUrl || user.picture || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return res.json({ success: true, uid: user.uid });
    } catch (error) {
      console.error('Error syncing user to database:', error);
      return res.status(500).json({ error: 'Failed to sync user' });
    }
  });

  // Fetch citizen reports from Cloud SQL
  app.get('/api/reports', optionalAuth, async (_req, res) => {
    try {
      const reports = await db
        .select()
        .from(citizenReports)
        .orderBy(desc(citizenReports.createdAt))
        .limit(50);
      return res.json(reports);
    } catch (error) {
      console.error('Error fetching reports from database:', error);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  // Submit citizen hazard report to Cloud SQL
  app.post('/api/reports', optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const {
        trackingId,
        category,
        department,
        severity,
        status,
        latitude,
        longitude,
        address,
        description,
        imageUrl,
      } = req.body;

      const reportId = crypto.randomUUID();
      const newReport = {
        id: reportId,
        trackingId: trackingId || `TRK-${Date.now().toString().slice(-6)}`,
        userId: req.user?.uid || null,
        category: category || 'Citizen Hazard',
        department: department || 'Municipal Engineering Bureau',
        severity: severity || 'High',
        status: status || 'Dispatched',
        latitude: latitude ? String(latitude) : null,
        longitude: longitude ? String(longitude) : null,
        address: address || 'Bangalore Urban Sector',
        description: description || 'Reported hazard at urban node.',
        imageUrl: imageUrl || null,
        createdAt: new Date(),
      };

      await db.insert(citizenReports).values(newReport);
      return res.status(201).json(newReport);
    } catch (error) {
      console.error('Error creating report in database:', error);
      return res.status(500).json({ error: 'Failed to create report' });
    }
  });

  // Fetch traffic incident logs from Cloud SQL
  app.get('/api/traffic/incidents', async (_req, res) => {
    try {
      const incidents = await db
        .select()
        .from(trafficIncidents)
        .orderBy(desc(trafficIncidents.createdAt))
        .limit(20);
      return res.json(incidents);
    } catch (error) {
      console.error('Error fetching traffic incidents:', error);
      return res.status(500).json({ error: 'Failed to fetch incidents' });
    }
  });

  // Record traffic incident or emergency override in Cloud SQL
  app.post('/api/traffic/incidents', optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { intersectionId, intersectionName, status, vehicleCount, ambulanceDetected } = req.body;
      const incidentId = crypto.randomUUID();
      const newIncident = {
        id: incidentId,
        intersectionId: intersectionId || 'INT-01',
        intersectionName: intersectionName || 'MG Road Intersection',
        status: status || 'EMERGENCY_GREEN',
        vehicleCount: typeof vehicleCount === 'number' ? vehicleCount : 0,
        ambulanceDetected: Boolean(ambulanceDetected),
        reportedBy: req.user?.uid || null,
        createdAt: new Date(),
      };

      await db.insert(trafficIncidents).values(newIncident);
      return res.status(201).json(newIncident);
    } catch (error) {
      console.error('Error recording traffic incident:', error);
      return res.status(500).json({ error: 'Failed to record incident' });
    }
  });

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Metropolis-AI Core', database: 'Cloud SQL PostgreSQL' });
  });

  // Vite middleware in dev or static serve in prod
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.use((_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Metropolis-AI Core full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
