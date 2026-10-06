type LineSdk = { init: (config: { liffId: string }) => Promise<unknown>; isLoggedIn: () => boolean; isInClient: () => boolean; logout: () => void; login: (config: { redirectUri: string }) => void };
const initialization = new WeakMap<object, { id: string; promise: Promise<unknown> }>();
export function initializeLine(sdk: LineSdk, id: string): Promise<unknown> {
  const cached = initialization.get(sdk);
  if (cached?.id === id) return cached.promise;
  const promise = sdk.init({ liffId: id }).catch(e => { initialization.delete(sdk); throw e; });
  initialization.set(sdk, { id, promise }); return promise;
}
export function reauthenticateLine(sdk: LineSdk, redirectUri: string): 'reopen' | 'redirecting' {
  if (sdk.isInClient()) return 'reopen';
  if (sdk.isLoggedIn()) sdk.logout();
  sdk.login({ redirectUri }); return 'redirecting';
}
