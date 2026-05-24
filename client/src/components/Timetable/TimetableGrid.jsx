import React from 'react';
import './TimetableGrid.css';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 9);

const COLORS = ['#4A90D9', '#E67E22', '#27AE60', '#8E44AD', '#E74C3C'];

export default function TimetableGrid({ courses = [] }) {
  const colorMap = {};
  courses.forEach((c, i) => { colorMap[c.id] = COLORS[i % COLORS.length]; });

  const getCourseAtSlot = (day, hour) =>
    courses.find(course =>
      (course.timeslots || []).some(
        slot => slot.day === day && slot.start <= `${hour}:00` && slot.end > `${hour}:00`
      )
    );

  return (
    <div className="timetable-grid">
      <div className="timetable-header">
        <div className="time-col" />
        {DAYS.map(day => <div key={day} className="day-col">{day}</div>)}
      </div>
      {HOURS.map(hour => (
        <div key={hour} className="timetable-row">
          <div className="time-col">{hour}:00</div>
          {DAYS.map(day => {
            const course = getCourseAtSlot(day, hour);
            return (
              <div
                key={day}
                className={`cell ${course ? 'occupied' : ''}`}
                style={course ? { backgroundColor: colorMap[course.id] } : {}}
                title={course?.name}
              >
                {course ? course.name : ''}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
