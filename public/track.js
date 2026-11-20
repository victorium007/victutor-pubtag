/* VicTutor – רישום שימוש אנונימי. ללא שם, ללא פרטים מזהים. כשל ברישום לא משפיע על המתרגל. */
(function () {
  var ENDPOINT = '/api/log', MAX = 40, q = [], unit = '', sid = rnd(), uid = '';
  function rnd() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  try { uid = localStorage.getItem('victutor-uid') || ''; if (!uid) { uid = rnd(); localStorage.setItem('victutor-uid', uid); } } catch (e) { uid = 'nouid-' + sid; }
  function hash(s) { var h = 5381; s = String(s || ''); for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function push(ev) {
    try {
      ev.ts = new Date().toISOString(); ev.unit = unit; q.push(ev);
      if (q.length >= MAX) flush();
    } catch (e) {}
  }
  function flush() {
    if (!q.length) return;
    var body = JSON.stringify({ uid: uid, sid: sid, dev: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop', ev: q.splice(0, q.length) });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
      fetch(ENDPOINT, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  var sTimer = null, lastTerm = '';
  window.VT = {
    start: function (u, v) { unit = u || ''; push({ t: 'visit', view: v, ref: (document.referrer || '').slice(0, 120) }); setTimeout(flush, 3000); },
    view: function (v) { push({ t: 'view', view: v }); },
    answer: function (kind, i, text, r) { push({ t: 'answer', kind: kind, q: i, qid: kind + '-' + i + '-' + hash(text), label: String(text || '').slice(0, 90), pick: r.pick, miss: r.miss, wrong: r.wrong, ok: !!r.ok }); },
    search: function (term) {
      clearTimeout(sTimer);
      sTimer = setTimeout(function () { var t = String(term || '').trim(); if (t.length >= 2 && t !== lastTerm) { lastTerm = t; push({ t: 'search', term: t.slice(0, 60) }); } }, 1500);
    }
  };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  setInterval(flush, 60000);
})();
