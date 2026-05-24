const express = require('express');
const router = express.Router();
const trackerCache = require('../scheduler/tracker');
const authMiddleware = require('../middleware/auth');

// GET /api/tracker
router.get('/', authMiddleware, (req, res) => {
  res.json({ tracker: trackerCache.get() });
});

module.exports = router;
