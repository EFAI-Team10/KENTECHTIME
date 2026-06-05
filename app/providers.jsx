'use client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ThemeProvider } from '@/contexts/ThemeContext';

export default function Providers({ children }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}
