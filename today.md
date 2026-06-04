# 2026-06-04 수정 내역

---

## 1. 시간표 저장 복원 버그 수정
- 페이지 마운트 시 저장된 시간표를 먼저 불러오고, 없을 때만 추천 생성
- `/api/schedule/my` 응답에 `id`, `code`, `target_grade` 필드 추가 (복원에 필요)

## 2. 온보딩 트랙 선호도 미반영 수정
- `TimetableGrid`의 `trackOrder`가 로컬 state여서 온보딩에서 저장한 트랙이 반영 안 되던 문제 수정
- 페이지 마운트 시 DB의 `preferred_tracks`로 초기화

## 3. 설정에서 관심 트랙 토글 편집 추가
- 설정 → 추천 설정에 트랙 토글 UI 추가 (선택 순서 번호 뱃지 표시)
- 저장 시 `preferred_tracks` DB에 반영

## 4. 선호 영역 레이블 수정
- EN: 영어 → 창업
- MN: 경영 → 필수교양
- FR: 학점교류 → 자유학점

## 5. 다학기 중복 집계 버그 수정 (Critical)
- 같은 과목 코드가 여러 학기로 DB에 저장된 경우 졸업요건 집계 시 중복 합산되던 버그 수정
- `requirements/route.js`: `seenCodes` Set으로 코드 기준 dedup
- `onboarding/page.jsx`: 포털 매칭 시 코드당 1개만 선택

## 6. HASS/EN/CAPS/IR 추천 우선순위 보장
- EL 과목이 많아 소학점 필수 영역이 밀리는 문제 수정
- `bumpPriorityCats`: 4개 카테고리에서 각 1개를 candidates 맨 앞으로 배치

## 7. 트랙 우선순위 상태 통합 (Refactor)
- `TimetableGrid`의 로컬 `trackOrder` state 제거
- `page.jsx`에서 단일 관리 → 설정에서 저장 시 시간표 즉시 반영, 시간표 변경도 추천에 실시간 반영

## 8. 트랙 우선순위 칩 표시 순서 수정
- 선택된 트랙을 우선순위 순서대로 앞에 배치 → ①②③이 왼쪽부터 순서대로 표시

## 9. 시간표 trackOrder를 추천 알고리즘에 반영
- `loadRecommendations`가 DB `preferred_tracks` 대신 현재 UI의 `trackOrder`를 override하여 사용

## 10. 원자력 트랙 → 재료/화학 통합
- TRACKS 배열에서 원자력 제거 (onboarding, Settings, TimetableGrid)
- `normalizeTrack` 함수: DB의 원자력 과목을 재료/화학으로 매핑 (추천 정렬·셀 피커 모두 적용)

## 11. EL4/5 진행상황 메인 EL 바에 통합
- EL 바 오른쪽 20%(2/10)를 구분선으로 나눠 EL4/5 존 표시
- 슬롯 독립 fill: 이수 시 불투명, 시간표 미리보기 시 30% 투명, 미이수 시 배경색만
- "EL4/5" 텍스트 레이블 표시
- 여러 차례 반복 수정으로 최종 확정

## 12. EL 바를 과목 수 기준으로 변경
- 기존 학점 기준(N/40학점) → **과목 수 기준(N/10과목)** (1과목 = 1/10)
- `requirements/route.js`에 `elCount` 추가
- 수치 표시: `N+M과목 / 10과목`

## 13. 추천 알고리즘 4가지 개선
- **[Fix1] 이수 완료 카테고리 추천 제외**: 요건 충족 카테고리 과목 풀에서 제거. EL은 학점(40)+EL4/5(2개) 모두 충족 시에만 완료.
- **[Fix2] EL4/5 우선 추천**: `bumpEL45` — `elUpperCount < 2`이면 EL4/5 과목을 EL 후보 앞으로 배치
- **[Fix3] Plan B·C 소학점 영역 보장**: `bumpPriorityCats`를 plan 루프 내부에서 매번 재적용
- **[부수] DB 쿼리 최적화**: `getCompletedCodes` 2회 쿼리 → `getCompletedInfo` 1회 쿼리로 통합
