import pandas as pd
import sys
import io
import os

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

excel_files = [
    r"c:\Users\USER\OneDrive - 한국에너지공과대학교\바탕 화면\KENTECH\3-1\인공지능과 프로그래밍 기초\Project 2\KENTECHTIME\개설교과목 리스트_2025_2학기.xlsx",
    r"c:\Users\USER\OneDrive - 한국에너지공과대학교\바탕 화면\KENTECH\3-1\인공지능과 프로그래밍 기초\Project 2\KENTECHTIME\개설교과목 리스트_2026_1학기.xlsx"
]

for filepath in excel_files:
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        continue
    print(f"\n--- Reading: {os.path.basename(filepath)} ---")
    try:
        df = pd.read_excel(filepath)
        # 0번 행은 컬럼 부가 정보(학학년 등)이므로 제외하고 1번 행부터 데이터
        df_data = df.iloc[1:]
        
        print("Unique Grades:", df_data['Unnamed: 1'].unique().tolist())
        print("Unique Categories:", df_data['영역\n구분'].unique().tolist())
        
        # 비고에 기재된 내용 중 트랙 관련 정보가 있는지 확인
        if '비고' in df_data.columns:
            non_null_remarks = df_data['비고'].dropna().unique().tolist()
            print("Unique Remarks (first 10):", non_null_remarks[:10])
            
        # 트랙(track) 컬럼이 따로 있는지 확인
        track_related = [c for c in df_data.columns if '트랙' in str(c) or 'track' in str(c).lower()]
        print("Track related columns:", track_related)
        
        # 샘플 출력
        print("Sample rows:")
        sample = df_data[['교과목코드', '교과목명(국문)', '영역\n구분', '시간표', '학점', 'Unnamed: 1', '비고']].dropna(subset=['교과목코드']).head(5)
        for idx, row in sample.iterrows():
            print(row.to_dict())
            
    except Exception as e:
        print(f"Error reading file: {e}")
