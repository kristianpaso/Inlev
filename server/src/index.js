import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import db from './db.js';
import authRoutes from './routes_auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 5174;
const ORIGIN = process.env.ORIGIN || `http://localhost:${PORT}`;

app.use(helmet());
app.use(express.json({ limit:'1mb' }));
app.use(cookieParser());
app.use(cors({
  origin: ORIGIN,
  credentials: true
}));

// API routes
app.use('/api/auth', authRoutes(process.env));

// Static files
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, { extensions:['html'] }));

// Fallback to index or 404-like
app.use((req,res)=>{
  res.status(404).sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, ()=>{
  console.log(`Inlev server up on http://localhost:${PORT}`);
});
