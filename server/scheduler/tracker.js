const cron = require('node-cron');
const db = require('../models/db');

let cachedData = [];
const currentSemester = process.env.CURRENT_SEMESTER || '2025-spring';

cron.schedule('*/10 * * * *', async () => {
  try {
    const result = await db.query(
      `SELECT course_id, COUNT(*) as applicants
       FROM planned_schedules
       WHERE semester = $1
       GROUP BY course_id`,
      [currentSemester]
    );
    cachedData = result.rows;
  } catch (err) {
    console.error('Tracker update failed:', err.message);
  }
});

module.exports = { get: () => cachedData };
