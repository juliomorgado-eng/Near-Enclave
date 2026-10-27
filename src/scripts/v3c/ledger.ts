// Deterministic "public ledger" rows — the raw material of the Two Ledgers scene.
// Shared by the WebGL texture (client) and the no-WebGL fallback (server render).
// Each row comes with a parallel weight string: 0 = dim, 1 = mid, 2 = bright (the amount).

const TYPES = ['TRANSFER', 'SWAP', 'REPO', 'MINT', 'SETTLE', 'COLLAT', 'PAY', 'AGENT.PAY', 'REDEEM', 'BRIDGE'];
const ASSETS = ['USDC', 'USDT', 'T-BILL', 'EURC', 'wBTC', 'NEAR', 'BUIDL', 'PYUSD', 'MMF'];
const HEXC = '0123456789abcdef';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type LedgerRow = { text: string; weight: string };

export function ledgerRows(rows: number, cols: number, seed = 27): LedgerRow[] {
  const r = rng(seed);
  const hex = (n: number) => Array.from({ length: n }, () => HEXC[(r() * 16) | 0]).join('');
  const pad = (n: number) => String(n).padStart(2, '0');
  const amount = () => {
    const mag = Math.pow(10, 2 + r() * 6);
    return (Math.round(mag * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  let clock = 9 * 3600 + 30 * 60;
  const out: LedgerRow[] = [];
  for (let i = 0; i < rows; i++) {
    let text = '';
    let weight = '';
    const push = (s: string, w: number) => {
      text += s;
      weight += String(w).repeat(s.length);
    };
    while (text.length < cols) {
      clock += 1 + ((r() * 9) | 0);
      const t = `${pad(((clock / 3600) | 0) % 24)}:${pad(((clock / 60) | 0) % 60)}:${pad(clock % 60)}`;
      push(t, 0);
      push('  ', 0);
      push(`0x${hex(4)}…${hex(4)}`, 1);
      push(' → ', 0);
      push(`0x${hex(4)}…${hex(4)}`, 1);
      push('  ', 0);
      push(TYPES[(r() * TYPES.length) | 0].padEnd(9, ' '), 1);
      push(' ', 0);
      push(amount().padStart(14, ' '), 2);
      push(' ', 0);
      push(ASSETS[(r() * ASSETS.length) | 0].padEnd(6, ' '), 1);
      push('    ', 0);
    }
    out.push({ text: text.slice(0, cols), weight: weight.slice(0, cols) });
  }
  return out;
}

/** What the public sees once a value is sealed: same shape, no content. */
export const sealString = (s: string) => s.replace(/[^\s]/g, '█');
