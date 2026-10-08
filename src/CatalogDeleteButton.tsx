import { Trash2 } from 'lucide-react';
import type { CatalogManagement } from './catalogManagementTypes';

export default function CatalogDeleteButton({ label, management, busy, remove }: { label: string; management?: CatalogManagement; busy: boolean; remove: () => Promise<unknown> }) {
  return <div className="wp-delete-action"><button type="button" className="wp-danger" disabled={busy || !management?.canDelete} title={management?.deleteReason || 'ลบรายการที่ยังไม่ถูกใช้งาน'} onClick={() => { if (window.confirm(`ลบ ${label}? รายการจะหายจากระบบ ลบได้เฉพาะรายการที่ยังไม่มีข้อมูลผูกอยู่`)) void remove(); }}><Trash2 size={15} />ลบ</button>{management?.deleteReason && <small>{management.deleteReason}</small>}</div>;
}
