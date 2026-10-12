import { pilotRequest as dispatchRoutes, type PilotEnv } from './pilotRoutes';
import { adminLogout } from './adminLogout';
import { receiptUploadResponse } from './receiptResponse';

export type { PilotEnv, ReceiptKV } from './pilotRoutes';

// Public pilot entry point. Keep session teardown and the upload response
// contract here; the existing business routes retain their original guards.
export async function pilotRequest(request: Request, env: PilotEnv, verify: Parameters<typeof dispatchRoutes>[2]): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === '/api/finance/logout') return adminLogout(request, env);
  const response = await dispatchRoutes(request, env, verify);
  if (response && request.method === 'POST' && /^\/api\/player\/(bookings|lessons)\/[^/]+\/receipt$/.test(path)) {
    return receiptUploadResponse(response);
  }
  return response;
}
