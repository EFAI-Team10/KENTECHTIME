'use client';
import { create } from 'zustand';

const getToken = () =>
  typeof window !== 'undefined' ? localStorage.getItem('token') : null;

const useStore = create((set) => ({
  user: null,
  token: getToken(),
  currentSchedule: [],
  semester: '2026-fall',

  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (typeof window !== 'undefined') localStorage.setItem('token', token);
    set({ token });
  },
  logout: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('token');
    set({ user: null, token: null, currentSchedule: [] });
  },
  setCurrentSchedule: (schedule) => set({ currentSchedule: schedule }),
  setSemester: (semester) => set({ semester }),
}));

export default useStore;
