import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './lib/api-interceptor'; // Import mock backend before anything else
import { initDriveSync } from './lib/drive-sync';
import App from './App.tsx';
import './index.css';

// Initialize Google Drive Sync
initDriveSync().catch(console.error);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
