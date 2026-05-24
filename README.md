# KENTECHTIME

KENTECH 학사과정 재학생을 위한 **졸업 요건 기반 맞춤형 시간표 자동 추천 서비스**

---

## 주요 기능

- **이메일 인증**: `@kentech.ac.kr` 계정 전용
- **시간표 자동 추천**: 필수 미이수 과목 · 선수 과목 · 라이프스타일 제약 기반 Plan A/B/C 생성
- **LLM 대화형 수정**: "목요일 오전 수업은 빼줘" 같은 자연어 요청으로 시간표 즉시 수정
- **졸업 요건 대시보드**: VC / EF / EL 이수 현황 시각화
- **수강 희망 경쟁률 트래커**: 10분마다 자동 갱신

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18 · React Router · Zustand · Recharts |
| 백엔드 | Node.js · Express · JWT · bcryptjs |
| 데이터베이스 | PostgreSQL |
| LLM | OpenAI API (gpt-4o-mini) |
| 스케줄러 | node-cron |

---

## 빠른 시작

### 1. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일을 열어 실제 값으로 채워주세요
```

### 2. 데이터베이스 초기화

```bash
psql -U postgres -d kentechtime -f database/schema.sql
```

### 3. 서버 실행

```bash
cd server
npm install
npm run dev
```

### 4. 클라이언트 실행

```bash
cd client
npm install
npm start
```

브라우저에서 `http://localhost:3000` 접속

---

## 프로젝트 구조

```
KENTECHTIME/
├── client/          # React 프론트엔드 (포트 3000)
├── server/          # Express 백엔드 (포트 4000)
├── database/        # PostgreSQL 스키마
└── .env.example     # 환경 변수 예시
```

---

## 팀원

| 이름 | 담당 |
|------|------|
| 강민기 | 인증 · 배포 · README |
| 구형준 | 시간표 그리드 · 대시보드 |
| 권우성 | LLM 연동 · 채팅 UI |
| 박현담 | 추천 알고리즘 · DB |
