// דוח שימוש למרצה. גישה רק עם המפתח שמוגדר במשתנה הסביבה REPORT_KEY ב-Netlify.
// /api/report?key=...&days=7            דוח HTML לשבעת הימים האחרונים (ברירת מחדל: 7)
// /api/report?key=...&from=2026-11-17&to=2026-11-24
// /api/report?key=...&days=all&format=csv   כל האירועים כקובץ CSV
import { getStore } from '@netlify/blobs';

const HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'];
const KIND = { mcq: 'רב־ברירה', tf: 'נכון / לא נכון', iss: 'זיהוי סוגיות' };
const VIEW = { mcq: 'רב־ברירה', tf: 'נכון / לא נכון', issues: 'זיהוי סוגיות', kb: 'מאגר ידע', search: 'חיפוש' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '—');
const day = (d) => d.toISOString().slice(0, 10);

function weekOf(ts) { // שבוע שמתחיל ביום ראשון
  const d = new Date(ts.slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return day(d);
}

async function load(from, to) {
  const store = getStore('events');
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).filter((k) => { const d = k.slice(0, 10); return (!from || d >= from) && (!to || d <= to); });
  const rows = [];
  for (let i = 0; i < keys.length; i += 25) {
    const part = await Promise.all(keys.slice(i, i + 25).map((k) => store.get(k, { type: 'json' }).catch(() => null)));
    part.forEach((r) => r && r.ev && r.ev.forEach((e) => rows.push({ uid: r.uid, sid: r.sid, dev: r.dev, ...e })));
  }
  return rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
}

function csv(rows) {
  const cols = ['ts', 'uid', 'sid', 'dev', 'unit', 't', 'view', 'kind', 'q', 'qid', 'label', 'pick', 'ok', 'miss', 'wrong', 'term', 'ref'];
  const cell = (v) => { if (v === undefined || v === null) return ''; if (Array.isArray(v)) v = v.join(' | '); v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '﻿' + cols.join(',') + '\n' + rows.map((r) => cols.map((c) => cell(r[c])).join(',')).join('\n');
}

function table(head, body) {
  return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}">אין נתונים</td></tr>`}</tbody></table>`;
}

function html(rows, label) {
  const uids = new Set(rows.map((r) => r.uid)), sids = new Set(rows.map((r) => r.sid));
  const ans = rows.filter((r) => r.t === 'answer');

  // כניסות לפי שבוע
  const wk = {};
  rows.forEach((r) => { const w = weekOf(r.ts); (wk[w] ||= { u: new Set(), s: new Set(), a: 0 }); wk[w].u.add(r.uid); wk[w].s.add(r.sid); if (r.t === 'answer') wk[w].a++; });
  const weeks = Object.keys(wk).sort().map((w) => [w, wk[w].u.size, wk[w].s.size, wk[w].a]);

  // יחידה וסוג תרגול
  const byUnit = {};
  ans.forEach((r) => { const k = (r.unit || '—') + '|' + r.kind; (byUnit[k] ||= { u: new Set(), n: 0, ok: 0 }); byUnit[k].u.add(r.uid); byUnit[k].n++; if (r.ok) byUnit[k].ok++; });
  const units = Object.entries(byUnit).map(([k, v]) => { const [u, kd] = k.split('|'); return [esc(u), KIND[kd] || kd, v.u.size, v.n, pct(v.ok, v.n)]; });
  const views = {};
  rows.filter((r) => r.view).forEach((r) => { views[r.view] = (views[r.view] || 0) + 1; });

  // שאלות: ניסיון ראשון של כל מבקר
  const first = {};
  ans.forEach((r) => { const k = r.uid + '|' + r.qid; if (!first[k]) first[k] = r; });
  const qs = {};
  Object.values(first).forEach((r) => {
    const q = (qs[r.qid] ||= { kind: r.kind, q: r.q, label: r.label, unit: r.unit, n: 0, ok: 0, picks: {}, miss: {}, wrong: {} });
    q.n++; if (r.ok) q.ok++;
    if (r.kind === 'mcq' && Number.isInteger(r.pick)) q.picks[r.pick] = (q.picks[r.pick] || 0) + 1;
    (r.miss || []).forEach((m) => { q.miss[m] = (q.miss[m] || 0) + 1; });
    (r.wrong || []).forEach((m) => { q.wrong[m] = (q.wrong[m] || 0) + 1; });
  });
  const top = (o, n = 2) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${esc(k)} (${v})`).join('; ');
  const hard = Object.values(qs).filter((q) => q.n >= 3).sort((a, b) => a.ok / a.n - b.ok / b.n || b.n - a.n).slice(0, 15).map((q) => {
    let detail = '';
    if (q.kind === 'mcq') detail = 'בחירות: ' + Object.entries(q.picks).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${HE[k] || k} – ${v}`).join(', ');
    if (q.kind === 'iss') detail = [Object.keys(q.miss).length ? 'הוחמצו: ' + top(q.miss) : '', Object.keys(q.wrong).length ? 'סומנו בטעות: ' + top(q.wrong) : ''].filter(Boolean).join('<br>');
    const name = { mcq: 'שאלה', tf: 'טענה', iss: 'אירוע' }[q.kind] + ' ' + (q.q + 1);
    return [`${KIND[q.kind]} · ${name}`, esc(q.label), q.n, pct(q.ok, q.n), detail];
  });

  // חיפושים
  const terms = {};
  rows.filter((r) => r.t === 'search').forEach((r) => { const t = r.term.trim(); terms[t] = (terms[t] || 0) + 1; });
  const termRows = Object.entries(terms).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t, n]) => [esc(t), n]);

  const dev = rows.filter((r) => r.t === 'visit').reduce((m, r) => (m[r.dev] = (m[r.dev] || 0) + 1, m), {});

  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>דוח שימוש – מתרגל</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:1000px;margin:24px auto;padding:0 16px;color:#1d2433;line-height:1.5}h1{font-size:22px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #dde;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #dde;padding:6px 8px;text-align:right;vertical-align:top}th{background:#f2f4f8}.k{display:flex;gap:12px;flex-wrap:wrap}.k div{background:#f2f4f8;border-radius:8px;padding:10px 14px}.k b{display:block;font-size:22px}.m{color:#667;font-size:13px}</style></head><body>
<h1>דוח שימוש במתרגל</h1><p class="m">טווח: ${esc(label)} · הופק ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))} UTC · הנתונים אנונימיים. "מבקר" הוא דפדפן, כך שסטודנט שנכנס משני מכשירים נספר פעמיים.</p>
<div class="k"><div><b>${uids.size}</b>מבקרים ייחודיים</div><div><b>${sids.size}</b>כניסות</div><div><b>${ans.length}</b>תשובות</div><div><b>${pct(ans.filter((r) => r.ok).length, ans.length)}</b>תשובות נכונות</div><div><b>${dev.mobile || 0}</b>כניסות מנייד</div><div><b>${dev.desktop || 0}</b>כניסות ממחשב</div></div>
<h2>לפי שבוע</h2>${table(['שבוע (מיום א׳)', 'מבקרים', 'כניסות', 'תשובות'], weeks)}
<h2>לפי יחידה וסוג תרגול</h2>${table(['יחידה', 'סוג', 'מבקרים', 'תשובות', 'נכונות'], units)}
<p class="m">פתיחת לשוניות: ${Object.entries(views).map(([k, v]) => `${VIEW[k] || esc(k)} ${v}`).join(' · ') || '—'}</p>
<h2>השאלות הקשות</h2><p class="m">לפי הניסיון הראשון של כל מבקר; רק שאלות שנענו לפחות 3 פעמים. באירועים, "נכונות" היא זיהוי מלא בלי סימון שגוי.</p>${table(['פריט', 'נוסח (קטע)', 'ענו', 'נכונות', 'פירוט'], hard)}
<h2>חיפושים במאגר הידע</h2>${table(['מונח', 'פעמים'], termRows)}
</body></html>`;
}

export default async (req) => {
  const u = new URL(req.url);
  const key = process.env.REPORT_KEY;
  if (!key || u.searchParams.get('key') !== key) return new Response('Not found', { status: 404 });
  let from = u.searchParams.get('from'), to = u.searchParams.get('to'), label;
  const days = u.searchParams.get('days') || (from ? '' : '7');
  if (days && days !== 'all') { const d = new Date(); d.setUTCDate(d.getUTCDate() - (parseInt(days, 10) || 7) + 1); from = day(d); to = null; label = `${days} הימים האחרונים`; }
  else if (days === 'all') { from = to = null; label = 'כל התקופה'; }
  else label = `${from} עד ${to || 'היום'}`;
  const rows = await load(from, to);
  if (u.searchParams.get('format') === 'csv')
    return new Response(csv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="victutor-usage.csv"', 'Cache-Control': 'no-store' } });
  return new Response(html(rows, label), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
};

export const config = { path: '/api/report' };
