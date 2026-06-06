import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  googleLogin: (id_token) => api.post('/auth/google', { id_token }),
  googleRegister: (payload) => api.post('/auth/google/register', payload),
};

export const scheduleAPI = {
  recommend: (data) => api.post('/schedule/recommend', data),
  getMy: (semester) => api.get(`/schedule/my?semester=${semester}`),
  save: (data) => api.post('/schedule/save', data),               // { courseIds, semester, slot }
  deleteSlot: (semester, slot) => api.delete(`/schedule/save?semester=${semester}&slot=${slot}`),
  setActive: (data) => api.post('/schedule/active', data),        // { semester, slot }
  cancelActive: (semester) => api.delete(`/schedule/active?semester=${semester}`),
  setName: (data) => api.post('/schedule/name', data),            // { semester, slot, name }
};

export const coursesAPI = {
  getAll: (params) => api.get('/courses', { params }),
  getRequirements: () => api.get('/courses/requirements'),
  getCompleted: () => api.get('/courses/completed'),
  saveCompleted: (courses) => api.post('/courses/completed', { courses }),
  importByCodes: (courses, opts = {}) => api.post('/courses/import-by-codes', { courses, ...opts }),
  removeCompleted: (courseId) => api.delete(`/courses/completed?courseId=${courseId}`),
  addExternal: (data) => api.post('/courses/external', data),
  uploadCourses: (formData) => api.post('/courses/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

export const usersAPI = {
  getMe: () => api.get('/users/me'),
  updateProfile: (data) => api.patch('/users/me', data),
  savePreferences: (data) => api.post('/users/preferences', data),
  getPreferences: () => api.get('/users/preferences'),
  deleteAccount: () => api.delete('/users/me'),
};

export const chatAPI = {
  send: (data) => api.post('/chat', data),
};

export const trackerAPI = {
  get: (semester) => api.get(`/tracker?semester=${semester}`),
};

export default api;
