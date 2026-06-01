const fs = require('fs');
const path = require('path');
// root 환경 변수 로드
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const XLSX = require('xlsx');
const db = require('./models/db');
const { parseTimeslots } = require('./utils/parser');

const classlistDir = path.resolve(__dirname, '../classlist');

function parseGrade(gradeStr) {
  if (!gradeStr) return 0;
  const match = gradeStr.match(/(\d)학년/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 0; // '공통' 등은 0으로 처리
}

const semesterMap = {
  '1학기': 'spring',
  '2학기': 'fall',
  '하계': 'summer',
  '동계': 'winter'
};

async function seed() {
  console.log("Starting database seeding from classlist directory...");

  if (!fs.existsSync(classlistDir)) {
    console.error(`Classlist directory not found: ${classlistDir}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(classlistDir);
  const excelFiles = [];

  const fileRegex = /^개설교과목 리스트_(\d{4})_(1학기|2학기|하계|동계)\.xlsx$/;

  for (const filename of allFiles) {
    const match = filename.match(fileRegex);
    if (match) {
      const year = match[1];
      const korTerm = match[2];
      const engTerm = semesterMap[korTerm];
      excelFiles.push({
        path: path.join(classlistDir, filename),
        filename,
        semester: `${year}-${engTerm}`
      });
    }
  }

  console.log(`Found ${excelFiles.length} excel files to process.`);

  // 학기 정렬 (예: 2022-spring, 2022-summer, 2022-fall, 2022-winter 순)
  // 이렇게 하면 오래된 학기부터 순차적으로 들어가며 최신 데이터로 ON CONFLICT 덮어쓰기가 일관성 있게 작동함
  excelFiles.sort((a, b) => a.semester.localeCompare(b.semester));

  for (const fileInfo of excelFiles) {
    console.log(`Processing file: ${fileInfo.filename} => Semester: ${fileInfo.semester}`);
    try {
      const workbook = XLSX.readFile(fileInfo.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) {
        console.log(`Empty or invalid file structure in ${fileInfo.filename}`);
        continue;
      }

      const headers = rows[0];
      const colMap = {
        code: headers.indexOf('교과목코드'),
        name: headers.indexOf('교과목명(국문)'),
        category: headers.indexOf('영역\n구분'),
        timetable: headers.indexOf('시간표'),
        credits: headers.indexOf('학점'),
        grade: headers.indexOf('Unnamed: 1'),
        remarks: headers.indexOf('비고')
      };

      if (colMap.code === -1 || colMap.name === -1) {
        console.error(`Required columns not found in headers for ${fileInfo.filename}: ${headers}`);
        continue;
      }

      let count = 0;

      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const code = row[colMap.code];
        const name = row[colMap.name];

        if (!code || !name) continue;

        const credits = parseFloat(row[colMap.credits]) || 0;
        const category = row[colMap.category] || 'EL';
        const rawGrade = row[colMap.grade];
        const targetGrade = parseGrade(rawGrade);
        const timetableStr = row[colMap.timetable];
        const timeslots = parseTimeslots(timetableStr);

        await db.query(
          `INSERT INTO courses (code, name, credits, track, category, semester, target_grade, timeslots)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (code) DO UPDATE SET
             name = EXCLUDED.name,
             credits = EXCLUDED.credits,
             track = EXCLUDED.track,
             category = EXCLUDED.category,
             semester = EXCLUDED.semester,
             target_grade = EXCLUDED.target_grade,
             timeslots = EXCLUDED.timeslots`,
          [
            code.trim(),
            name.trim(),
            credits,
            null, // track
            category.trim(),
            fileInfo.semester,
            targetGrade,
            JSON.stringify(timeslots)
          ]
        );
        count++;
      }

      console.log(`Successfully seeded ${count} courses for semester ${fileInfo.semester}`);

    } catch (err) {
      console.error(`Error processing file ${fileInfo.filename}:`, err);
    }
  }

  console.log("Seeding process completed.");
}

seed()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
