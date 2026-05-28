import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

const clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;
if (!clientId) {
  // eslint-disable-next-line no-console
  console.error('REACT_APP_GOOGLE_CLIENT_ID is not set. Google login will not work.');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId || ''}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);
