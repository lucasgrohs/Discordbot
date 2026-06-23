// Estado efêmero do OAuth: state → quem está vinculando (expira em 10 min).
interface Pending {
  discordUserId: string;
  verifier: string;
  expires: number;
}

const map = new Map<string, Pending>();

export function putPending(state: string, discordUserId: string, verifier: string): void {
  map.set(state, { discordUserId, verifier, expires: Date.now() + 10 * 60 * 1000 });
}

export function takePending(state: string): Pending | null {
  const p = map.get(state);
  if (!p) return null;
  map.delete(state);
  if (Date.now() > p.expires) return null;
  return p;
}
