import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { coursesAPI } from '../api';
import './AdminPage.css';

export default function AdminPage() {
  const [semester, setSemester] = useState('2026-spring');
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text: '' }
  
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls')) {
        setFile(droppedFile);
        setMessage(null);
      } else {
        setMessage({ type: 'error', text: '엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.' });
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setMessage(null);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !semester) return;

    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('semester', semester);

    try {
      const res = await coursesAPI.uploadCourses(formData);
      if (res.data.success) {
        setMessage({
          type: 'success',
          text: `성공적으로 ${res.data.count}개의 과목이 데이터베이스에 등록/업데이트되었습니다.`
        });
        setFile(null); // 파일 초기화
      }
    } catch (err) {
      console.error(err);
      setMessage({
        type: 'error',
        text: err.response?.data?.error || '서버 오류로 업로드에 실패했습니다. 파일 스키마를 확인해 주세요.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-card">
        <h2>관리자 콘솔</h2>
        <p className="admin-desc">학기별 개설교과목 리스트(.xlsx)를 일괄 업로드하여 갱신합니다.</p>

        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label htmlFor="semester">대상 학기 선택</label>
            <select
              id="semester"
              className="admin-select"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              required
            >
              <option value="2025-spring">2025년 1학기 (2025-spring)</option>
              <option value="2025-fall">2025년 2학기 (2025-fall)</option>
              <option value="2026-spring">2026년 1학기 (2026-spring)</option>
              <option value="2026-fall">2026년 2학기 (2026-fall)</option>
            </select>
          </div>

          <div className="form-group">
            <label>엑셀 파일 업로드</label>
            <div
              className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={onButtonClick}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden-file-input"
                style={{ display: 'none' }}
                accept=".xlsx, .xls"
                onChange={handleFileChange}
              />
              <span className="upload-icon">📁</span>
              <p className="upload-text">
                파일을 드래그해서 놓거나, <span>여기를 클릭</span>하여 선택하세요.
              </p>
            </div>

            {file && (
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <button
                  type="button"
                  className="btn-remove-file"
                  onClick={() => setFile(null)}
                >
                  제거
                </button>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="admin-btn"
            disabled={loading || !file}
          >
            {loading ? '업로드 및 데이터 적재 중...' : '데이터베이스 반영'}
          </button>
        </form>

        {message && (
          <div className={`admin-message ${message.type}`}>
            <span>{message.type === 'success' ? '✓' : '⚠'}</span>
            <p>{message.text}</p>
          </div>
        )}

        <Link to="/" className="back-to-main">← 메인 페이지로 돌아가기</Link>
      </div>
    </div>
  );
}
