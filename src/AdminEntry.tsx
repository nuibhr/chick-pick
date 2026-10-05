import { lazy, useEffect, useState } from 'react';
const FinanceDashboard = lazy(() => import('./FinanceDashboard'));
const WorkspaceGate = lazy(() => import('./WorkspaceGate'));
export default function AdminEntry() {
  const [line, setLine] = useState<boolean | null>(null), [error, setError] = useState('');
  useEffect(() => { let active = true; fetch('/api/finance/auth').then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.message || 'เปิดหลังบ้านไม่ได้'); if (active) setLine(d.authMethod === 'line'); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  if (error) return <p role="alert">{error}</p>;
  if (line === null) return <p role="status">กำลังตรวจสิทธิ์ผู้จัด…</p>;
  return line ? <WorkspaceGate /> : <FinanceDashboard />;
}
