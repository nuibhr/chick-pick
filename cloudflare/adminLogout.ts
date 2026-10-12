import { clearAdminCookie, revokeAdminSession } from './pilotAuth';
import { TidbDocuments } from './tidbDocuments';

type LogoutEnv = { TIDB_DATABASE_URL?: string; ADMIN_SESSION_SECRET?: string };
const json = (body: unknown, status: number, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
});

export async function adminLogout(request: Request, env: LogoutEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ message: 'ใช้ POST' }, 405);
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site'
    || request.headers.has('Origin') && request.headers.get('Origin') !== new URL(request.url).origin) {
    return json({ message: 'ไม่อนุญาตคำขอข้ามเว็บไซต์' }, 403);
  }
  if (!env.TIDB_DATABASE_URL || !env.ADMIN_SESSION_SECRET) return json({ message: 'ยังยืนยันการออกจากระบบไม่ได้ กรุณาลองอีกครั้ง' }, 503);
  try {
    await revokeAdminSession(request, env.ADMIN_SESSION_SECRET, new TidbDocuments(env.TIDB_DATABASE_URL));
    return json({ success: true }, 200, { 'Set-Cookie': clearAdminCookie() });
  } catch {
    // Do not report successful server-side logout when the commit outcome is unknown.
    return json({ message: 'ยังยืนยันการออกจากระบบไม่ได้ กรุณาลองอีกครั้ง' }, 503);
  }
}
