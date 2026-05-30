import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authAPI = {
  googleLogin: (id_token) => api.post('/auth/google', { id_token }),
  googleRegister: (payload) => api.post('/auth/google/register', payload),
};

export const scheduleAPI = {
  recommend: (data) => api.post('/schedule/recommend', data),
  getMy: (semester) => api.get(`/schedule/my?semester=${semester}`),
  save: (data) => api.post('/schedule/save', data),
};

export const coursesAPI = {
  getAll: (params) => api.get('/courses', { params }),
  getRequirements: () => api.get('/courses/requirements'),
  saveCompleted: (courses) => api.post('/courses/completed', { courses }),
  uploadCourses: (formData) => api.post('/courses/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
};

export const usersAPI = {
  getMe: () => api.get('/users/me'),
  savePreferences: (data) => api.post('/users/preferences', data),
  getPreferences: () => api.get('/users/preferences'),
  deleteAccount: (id_token) => api.delete('/users/me', { data: { id_token } }),
};

export const chatAPI = {
  send: (data) => api.post('/chat', data),
};

export const trackerAPI = {
  get: () => api.get('/tracker'),
};

export default api;
