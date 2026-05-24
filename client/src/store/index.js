import { create } from 'zustand';

const useStore = create((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  currentSchedule: [],
  semester: '2025-spring',

  setUser: (user) => set({ user }),
  setToken: (token) => {
    localStorage.setItem('token', token);
    set({ token });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null, currentSchedule: [] });
  },
  setCurrentSchedule: (schedule) => set({ currentSchedule: schedule }),
  setSemester: (semester) => set({ semester }),
}));

export default useStore;
