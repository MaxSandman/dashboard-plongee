import express from 'express';
import cors from 'cors';
import weatherRouter from './routes/weather';
import tidesRouter from './routes/tides';
import clubRouter from './routes/club';
import equipmentRouter from './routes/equipment';
import diveReturnsRouter from './routes/diveReturns';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

app.use('/api/weather', weatherRouter);
app.use('/api/tides', tidesRouter);
app.use('/api/club', clubRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/dive-returns', diveReturnsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});

export default app;
