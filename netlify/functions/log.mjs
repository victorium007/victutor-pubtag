// קליטת אירועי שימוש מהמתרגל ושמירתם ב-Netlify Blobs. לא נשמרת כתובת IP.
import { getStore } from '@netlify/blobs';

const KINDS = new Set(['visit', 'view', 'answer', 'search']);
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
const num = (v) => (Number.isInteger(v) && v >= 0 && v < 1000 ? v : undefined);
const idx = (v) => (Array.isArray(v) ? v.filter((x) => num(x) !== undefined).slice(0, 20) : undefined);

function clean(e) {
  if (!e || !KINDS.has(e.t)) return null;
  const o = { t: e.t, ts: str(e.ts, 30), unit: str(e.unit, 80) };
  if (e.view) o.view = str(e.view, 20);
  if (e.ref) o.ref = str(e.ref, 120);
  if (e.t === 'answer') {
    o.kind = ['mcq', 'tf', 'iss'].includes(e.kind) ? e.kind : 'other';
    o.q = num(e.q); o.qid = str(e.qid, 40); o.label = str(e.label, 90); o.ok = !!e.ok;
    o.pick = typeof e.pick === 'boolean' ? e.pick : Array.isArray(e.pick) ? idx(e.pick) : num(e.pick);
    if (Array.isArray(e.miss)) o.miss = e.miss.map((x) => str(x, 80)).filter(Boolean).slice(0, 15);
    if (Array.isArray(e.wrong)) o.wrong = e.wrong.map((x) => str(x, 80)).filter(Boolean).slice(0, 15);
  }
  if (e.t === 'search') o.term = str(e.term, 60);
  return o;
}

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const raw = await req.text();
  if (raw.length > 30000) return new Response('', { status: 413 });
  let b;
  try { b = JSON.parse(raw); } catch { return new Response('', { status: 400 }); }
  const ev = (Array.isArray(b.ev) ? b.ev : []).slice(0, 100).map(clean).filter(Boolean);
  if (!ev.length) return new Response(null, { status: 204 });
  const rec = { uid: str(b.uid, 30), sid: str(b.sid, 30), dev: b.dev === 'mobile' ? 'mobile' : 'desktop', ev };
  const now = new Date();
  const key = `${now.toISOString().slice(0, 10)}/${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  await getStore('events').setJSON(key, rec);
  return new Response(null, { status: 204 });
};

export const config = { path: '/api/log' };
