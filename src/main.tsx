import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const AdminDashboard = lazy(() => import('./FinanceDashboard.tsx'));
const WorkspaceGate = lazy(() => import('./WorkspaceGate.tsx'));
const PlayerApp = lazy(() => import('./PlayerApp.tsx'));

const params = new URLSearchParams(window.location.search);
const isAdmin = params.get('admin') === '1' || window.location.pathname === '/admin';
const isPlayer = window.location.pathname === '/miniapp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div role="status" style={{ padding: '2rem', fontFamily: 'system-ui' }}>กำลังเปิด Chick&Pick…</div>}>
      {isAdmin ? <AdminDashboard /> : isPlayer ? <PlayerApp /> : <WorkspaceGate />}
    </Suspense>
  </StrictMode>,
);
