import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const AdminDashboard = lazy(() => import('./AdminEntry.tsx'));
const WorkspaceGate = lazy(() => import('./WorkspaceGate.tsx'));
const PlayerApp = lazy(() => import('./PlayerApp.tsx'));

const params = new URLSearchParams(window.location.search);
// Keep the organizer destination through LINE's primary/secondary redirects.
let organizerIntent = params.get('organizer') === '1';
try {
  if (organizerIntent) sessionStorage.setItem('cp-organizer-intent', String(Date.now()));
  if (params.get('organizer') === '0') sessionStorage.removeItem('cp-organizer-intent');
  const saved = Number(sessionStorage.getItem('cp-organizer-intent'));
  organizerIntent ||= window.location.pathname === '/miniapp' && saved > 0 && Date.now() - saved < 900000;
} catch { /* Explicit query still works when session storage is unavailable. */ }
const isAdmin = organizerIntent || params.get('admin') === '1' || window.location.pathname === '/admin';
const isPlayer = window.location.pathname === '/miniapp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div role="status" style={{ padding: '2rem', fontFamily: 'system-ui' }}>กำลังเปิด Chick&Pick…</div>}>
      {isAdmin ? <AdminDashboard /> : isPlayer ? <PlayerApp /> : <WorkspaceGate />}
    </Suspense>
  </StrictMode>,
);
