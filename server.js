// ============================================================
// Azure VM Pricing Calculator - Minimal Refresh Server
// Only exposes /refresh endpoint. All pricing served from static pricing.json.
// ============================================================

import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3001;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN || 'change-me-in-production';

const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many refresh requests.',
});

app.get('/refresh', refreshLimiter, async (req, res) => {
  const { token } = req.query;
  if (token !== REFRESH_TOKEN) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }

  try {
    console.log('🔄 Triggering pricing refresh...');
    const { spawn } = await import('child_process');
    const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scripts', 'refresh-pricing.js');
    console.log('Running:', scriptPath);
    const child = spawn('node', [scriptPath], { stdio: 'inherit' });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Refresh timed out after 10 minutes'));
      }, 600000); // 10 minute timeout
      child.on('close', (code) => {
        clearTimeout(timeout);
        code === 0 ? resolve() : reject(new Error(`Exit code ${code}`));
      });
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    console.log('✅ Pricing refresh complete');
    res.json({ status: 'ok', message: 'Pricing data refreshed' });
  } catch (error) {
    console.error('❌ Refresh failed:', error instanceof Error ? error.stack : error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🔄 Refresh server running on port ${PORT}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
