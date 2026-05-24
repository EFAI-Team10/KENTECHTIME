const express = require('express');
const router = express.Router();
const trackerCache = require('../scheduler/tracker');

// GET /api/tracker
router.get('/', (req, res) => {
  res.json({ tracker: trackerCache.get() });
});

module.exports = router;
