import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { GuestLimitsProvider } from './contexts/GuestLimitsContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { OpenProjectProvider } from './contexts/OpenProjectContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <GuestLimitsProvider>
        <ProjectsProvider>
          <OpenProjectProvider>
            <App />
          </OpenProjectProvider>
        </ProjectsProvider>
      </GuestLimitsProvider>
    </AuthProvider>
  </StrictMode>
);
