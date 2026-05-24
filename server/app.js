require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const scheduleRoutes = require('./routes/schedule');
const coursesRoutes = require('./routes/courses');
const chatRoutes = require('./routes/chat');
const trackerRoutes = require('./routes/tracker');

// 배치 스케줄러 초기화
require('./scheduler/tracker');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tracker', trackerRoutes);

app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
