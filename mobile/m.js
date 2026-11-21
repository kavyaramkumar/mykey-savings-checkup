'use strict';
/* Prototype 1's customer side, rebuilt as a phone app inside MyKey.
   Shares the same browser storage as the desktop prototype, so the banker console
   (../index.html) sees plans, flags and banker requests made here, and outreach sent
   from the console lands in this app's inbox. */
(function () {
  /* ================= helpers ================= */
  const STORE = 'mykey-checkup-demo';      // same key as prototype 1
  const GKEY = 'mykey-mobile-games';       // games, streaks and badges (per device)
  const DAY = 864e5;
  const $ = id => document.getElementById(id);
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const m = v => usd.format(Math.round(Number(v) || 0));
  const m2 = v => usd2.format(Number(v) || 0);
  const pct = v => Number(v).toFixed(2) + '%';
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = p => p + '-' + Math.random().toString(36).slice(2, 8);
  const dayKey = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const TODAY = dayKey(), YESTERDAY = dayKey(new Date(Date.now() - DAY));
  const DAYNUM = Math.floor(new Date(TODAY + 'T12:00:00').getTime() / DAY);
  const rng = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  function shuffle(arr, seed) { const r = rng(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const fmtDate = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtTime = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const keySvg = '<svg viewBox="0 0 34 16" aria-hidden="true"><circle cx="7" cy="8" r="5" fill="none" stroke="#cc0000" stroke-width="3"/><path d="M12 8h20M26 8v5M30.5 8v4" stroke="#cc0000" stroke-width="3" fill="none"/></svg>';

  /* ================= shared data (same model as prototype 1) ================= */
  function loadDb() {
    try { const d = JSON.parse(localStorage.getItem(STORE)); if (d && d.version === SEED.version && Array.isArray(d.profiles)) return d; } catch (e) { /* storage blocked */ }
    return clone(SEED);
  }
  function loadGames() { try { const g = JSON.parse(localStorage.getItem(GKEY)); if (g && g.days) return g; } catch (e) { /* ignore */ } return { days: {}, streak: { last: null, count: 0 }, badges: {} }; }
  let db = loadDb(), G = loadGames();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(db)); localStorage.setItem(GKEY, JSON.stringify(G)); } catch (e) { /* ignore */ } }
  function log(who, what) { db.audit.unshift({ at: Date.now(), who, what }); db.audit = db.audit.slice(0, 250); }
  const prof = id => db.profiles.find(p => p.id === id);
  const me = () => prof(db.session);
  const first = p => p.name.split(' ')[0];
  const matDate = p => fmtDate(Date.now() + p.cd.maturesInDays * DAY);
  const ui = { tab: 'home', sheet: null, enroll: false, game: null, kw: '', dive: null, rh: null, lad: null, lm: null, tick: null, openKnows: false };
  // pick up outreach sent from the desktop console in another tab
  window.addEventListener('storage', e => { if (e.key === STORE) { db = loadDb(); render(true); } });

  let toastT;
  function toast(t) {
    const app = $('app'); let el = app.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); app.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ================= checkup logic (from prototype 1) ================= */
  function work(p) {
    if (!p.work) p.work = { reserve: Math.min(p.goalAmount, p.cd.amount), months: p.needMonths, choice: 'renew', expense: Math.max(500, Math.round(p.goalAmount * 1.5 / 500) * 500) };
    p.work.reserve = Math.min(Math.max(0, p.work.reserve), p.cd.amount);
    p.work.expense = Math.min(p.work.expense, p.cd.amount);
    return p.work;
  }
  const rateFor = t => t <= 6 ? db.rates.cd6 : t <= 12 ? db.rates.cd12 : db.rates.cd18;
  function options(p) {
    const r = db.rates, w = work(p), rest = p.cd.amount - w.reserve, renew = rateFor(p.cd.termMonths), lad = (r.cd6 + r.cd12 + r.cd18) / 3;
    return [
      { id: 'renew', dest: 'cd', name: 'Renew for ' + p.cd.termMonths + ' months', sub: 'Lock in a rate', rate: renew },
      { id: 'ladder', dest: 'cd', name: '3-step CD ladder', sub: 'Part matures every 6 months', rate: lad },
      { id: 'flex', dest: 'cd', name: 'Flexible CD', sub: 'No penalty after an initial period', rate: r.noPenalty },
      { id: 'savings', dest: 'internal', name: 'Keep it all in savings', sub: 'Access anytime, rate can change', rate: r.savings },
      { id: 'out', dest: 'out', name: 'Move it out of KeyBank', sub: 'Your call. See what you give up first', rate: 0 }
    ].map(o => Object.assign(o, { interest: rest * o.rate / 100 }));
  }
  const penalty = (amt, apy) => amt * (apy / 100) * (db.rates.penaltyDays / 365);
  const recentTransfers = p => p.transfers.filter(t => t.daysAgo <= 30);

  /* ================= MyKey assistant (from prototype 1) ================= */
  const INTENTS = [
    ['scam', /password|\bpin\b|scam|fraud|social security|ssn|verify my account/i],
    ['banker', /banker|human|person|agent|call me|appointment|talk to|speak/i],
    ['game', /game|play|streak|learn/i],
    ['early', /early|penalt|break|before matur|need it soon/i],
    ['ladder', /ladder|rung/i],
    ['rates', /rate|apy|interest|\bfed\b|yield|other bank|offer|online bank/i],
    ['renew', /renew|roll ?over|automatic|grace/i],
    ['why', /why|data|privacy|track|personal|how do you know/i],
    ['maturity', /when.*matur|matur.*(date|day)|maturity/i],
    ['balance', /balance|how much do i have|my accounts/i],
    ['goal', /saving for|my goal|repair|emergency|tuition|\bcar\b|wedding|travel|medical|income/i],
    ['split', /split|accessible|reserve|keep|how much|plan|checkup|explain/i]
  ];
  const GOALS = [[/repair/i, 'Home repairs'], [/emergency/i, 'Emergency savings'], [/tuition|school|college/i, 'Tuition'], [/\bcar\b/i, 'Car replacement'], [/wedding/i, 'Wedding'], [/travel|trip/i, 'Travel'], [/medical/i, 'Medical costs'], [/income|retire/i, 'Monthly retirement income']];
  const CHIPS = [['split', 'Explain my split'], ['early', 'What if I need it early?'], ['rates', 'What if rates change?'], ['renew', 'What happens at maturity?'], ['why', 'Why am I seeing this?'], ['banker', 'Talk to a banker']];
  const intentOf = t => (INTENTS.find(([, re]) => re.test(t)) || ['fallback'])[0];
  function answer(intent, p, text) {
    const w = work(p), rest = p.cd.amount - w.reserve, detailed = p.prefs.detail === 'detailed', r = db.rates;
    if (db.content[intent]) return { text: db.content[intent], approved: true };
    const A = {
      split: () => 'Your Checkup keeps ' + m(w.reserve) + ' accessible for the next ' + w.months + ' months and puts ' + m(rest) + ' toward a term product. Only money you do not expect to need goes into a CD.' + (detailed ? ' At the illustrative demo rates, the reserve earns about ' + m(w.reserve * r.savings / 100) + ' a year in savings.' : ''),
      early: () => 'An early CD withdrawal may carry a penalty. See your CD terms for details.' + (detailed ? ' In this demo the illustrative penalty is ' + r.penaltyDays + ' days of interest.' : ''),
      rates: () => 'A fixed-rate CD keeps its rate until maturity, even if market rates move. Savings rates are variable and can change anytime. If another bank offers more, compare the dollars on the amount you would actually lock in. A banker can review your rate before you decide.' + (detailed ? ' Illustrative demo rates: savings ' + pct(r.savings) + ', 6 months ' + pct(r.cd6) + ', 12 months ' + pct(r.cd12) + ', 18 months ' + pct(r.cd18) + '.' : ''),
      renew: () => 'Your CD ending ' + p.cd.number + ' matures on ' + matDate(p) + '. Many CDs renew automatically for a similar term at the rate offered then, and some include a short grace period. Your CD terms say exactly what happens. The Checkup lets you decide first.',
      ladder: () => 'A ladder splits your money across several terms so part of it matures every few months. With ' + m(rest) + ', a 3-step ladder puts about ' + m(rest / 3) + ' each in 6, 12 and 18 month CDs. Ladder Up in Play lets you practice.',
      banker: () => 'I can connect you with a banker who will see your Checkup plan and your question, so you will not need to repeat yourself.',
      game: () => 'Play has short daily games that teach the ideas behind your plan: reserves, ladders, teaser rates and saving on uneven income. You are on a ' + G.streak.count + '-day streak.',
      why: () => (p.prefs.insights ? 'You are seeing this because your CD matures within ' + db.rules.windowDays + ' days. I use your balances, CD terms and the goal you shared. With personalized outreach on, recent activity can affect whether a banker reaches out first, and a banker will ask rather than assume why you moved money.' : 'Activity insights are off, so I only use your CD balance, maturity date and the goal you shared.') + ' You control this in Me.',
      maturity: () => 'Your ' + m(p.cd.amount) + ' CD ending ' + p.cd.number + ' matures on ' + matDate(p) + ', ' + p.cd.maturesInDays + ' days from today.',
      balance: () => 'Checking ' + m(p.checking) + ', savings ' + m(p.savings) + ', and your CD ' + m(p.cd.amount) + ' (matures ' + matDate(p) + ').',
      goal: () => { const g = GOALS.find(([re]) => re.test(text || '')); if (g) p.goal = g[1]; if (!p.goalConfirmed) { p.goalConfirmed = true; log(p.name, 'Confirmed savings goal in MyKey: ' + p.goal); } return 'Got it. I noted your goal as "' + p.goal + '". A banker only sees a goal you confirmed yourself. Want to size your accessible reserve around it in the Checkup?'; },
      scam: () => 'I will never ask for your password, PIN, or full Social Security number in chat. If someone contacts you claiming to be the bank and asks for those, stop and call the number on the back of your card.',
      fallback: () => 'I can help with your CD maturity plan, rates, early withdrawals, ladders, or connecting you to a banker. Try a suggestion below.'
    };
    return { text: (A[intent] || A.fallback)() };
  }
  function ask(p, text, intent) {
    intent = intent || intentOf(text);
    p.chat.push({ who: 'me', text });
    const a = answer(intent, p, text);
    p.chat.push({ who: 'bot', text: a.text, intent, approved: !!a.approved, id: uid('m'), banker: intent === 'banker', toCheckup: ['split', 'early', 'renew', 'goal', 'rates'].includes(intent), toPlay: ['game', 'ladder'].includes(intent) });
    save();
  }
  function greet(p) { if (!p.chat.length) p.chat.push({ who: 'bot', id: uid('m'), intent: 'hello', text: 'Hi ' + first(p) + ', I am MyKey. Your ' + m(p.cd.amount) + ' CD matures on ' + matDate(p) + '. I can help you decide how much to keep accessible and what to do with the rest.' }); }

  /* ================= chrome ================= */
  function header() {
    const p = me(), unread = p ? p.inbox.filter(x => !x.read).length : 0;
    return '<header class="top"><button class="brand" data-a="tab" data-v="home" aria-label="Home">KeyBank ' + keySvg + '</button>' +
      '<div class="row" style="gap:8px">' + (p ? '<button class="bell" data-a="tab" data-v="me" aria-label="Messages, ' + unread + ' unread">🔔' + (unread ? '<span>' + unread + '</span>' : '') + '</button>' : '') +
      '<button class="proto" data-a="sheet" data-v="about"><i></i>PROTOTYPE · IN MYKEY</button></div></header>';
  }
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11 12 4l9 7M6 9v11h12V9"/></svg>',
    checkup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    mykey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M16 12h.01M18 14h.01"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>'
  };
  function tabbar() {
    const playNew = !Object.keys(GAMES).some(k => (gday()[k] || {}).done);
    return '<nav class="tabbar" style="grid-template-columns:repeat(5,1fr)" aria-label="App">' + [['home', 'Home'], ['checkup', 'Checkup'], ['mykey', 'MyKey'], ['play', 'Learn'], ['me', 'Me']].map(([k, l]) =>
      '<button class="' + (ui.tab === k && !ui.game ? 'on' : '') + '" data-a="tab" data-v="' + k + '"' + (ui.tab === k ? ' aria-current="page"' : '') + '>' + ICON[k] + l + (k === 'play' && playNew ? '<span class="dot"></span>' : '') + '</button>').join('') + '</nav>';
  }

  /* ================= sign on ================= */
  function signOn() {
    if (ui.enroll) return '<div class="main" id="main"><button class="back" data-a="enroll" data-v="0" aria-label="Back">←</button><h1 class="hi" style="margin-top:10px">Enroll</h1><p class="muted small">Create a fictional demo profile. It also appears in the desktop banker console.</p>' +
      '<form data-f="enroll" class="card">' + fld('Full name', 'name', '', 'text', 'required') + fld('User ID', 'userId', '', 'text', 'required') + fld('Savings goal', 'goal', 'Emergency savings') +
      fld('Goal amount ($)', 'goalAmount', 4000, 'number', 'min="0" step="100" inputmode="numeric"') + fld('CD balance ($)', 'cdAmount', 10000, 'number', 'min="500" step="100" inputmode="numeric"') + fld('CD matures in (days)', 'days', 14, 'number', 'min="0" max="365" inputmode="numeric"') +
      '<label class="row small" style="margin:14px 0"><input type="checkbox" name="personalized" checked> Allow personalized MyKey outreach</label><button class="btn">Create and sign on</button></form></div>';
    return '<div class="main" id="main"><div class="card red" style="margin-top:4px"><div class="kicker">New in MyKey</div><h2 style="margin:4px 0 6px">Your CD is maturing. Let\'s plan what\'s next.</h2><p class="small" style="margin:0">Sign on to try the MyKey Savings Checkup.</p></div>' +
      '<form data-f="signon" class="card"><h2>Sign On</h2><p class="note" style="margin-top:0">Demo sign-on. This prototype never asks for a password.</p>' +
      '<label class="lbl" for="uid">User ID</label><input class="field" id="uid" name="uid" list="uids" autocomplete="off" autocapitalize="none" placeholder="e.g. michael.demo"><datalist id="uids">' + db.profiles.map(p => '<option value="' + esc(p.userId) + '">').join('') + '</datalist>' +
      '<button class="btn" style="margin-top:12px">Sign On</button></form>' +
      '<h3>Demo profiles</h3>' + db.profiles.map(p => '<button class="persona" data-a="signin" data-v="' + p.id + '"><span class="av">' + esc(p.initials || p.name[0]) + '</span><span><b>' + esc(p.name) + '</b><small>' + esc(p.segment) + ' · ' + m(p.cd.amount) + ' CD in ' + p.cd.maturesInDays + ' days</small></span></button>').join('') +
      '<button class="btn ghost" data-a="enroll" data-v="1">Enroll a new demo profile</button><p class="note" style="text-align:center">Case competition prototype. Fictional data. Not operated by or affiliated with KeyBank.</p></div>';
  }
  function fld(label, name, value, type, extra) { return '<label class="lbl" for="f-' + name + '">' + label + '</label><input class="field" id="f-' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value) + '" ' + (extra || '') + '>'; }

  /* ================= home ================= */
  function home() {
    const p = me(), hour = new Date().getHours(), unread = p.inbox.filter(x => !x.read).sort((x, y) => y.at - x.at);
    const activity = [{ d: 1, desc: 'Payroll deposit', amt: 2150 }, { d: 4, desc: 'Grocery', amt: -86.4 }].concat(p.prefs.insights ? recentTransfers(p).map(t => ({ d: t.daysAgo, desc: 'Transfer to ' + t.to, amt: -t.amount })) : []).sort((a, b) => a.d - b.d).slice(0, 4);
    const rec = recGame();
    return '<div class="main" id="main"><h1 class="hi">Good ' + (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening') + ', ' + esc(first(p)) + '</h1><p class="muted small">' + fmtDate(Date.now()) + '</p>' +
      (unread.length ? '<button class="card msgprev" data-a="tab" data-v="me"><span class="chip red">' + unread.length + ' new</span> <b>' + esc(unread[0].subject) + '</b></button>' : '') +
      '<div class="card red"><div class="kicker">MyKey Savings Checkup</div><h2 style="margin:4px 0 6px">Your ' + m(p.cd.amount) + ' CD matures in ' + p.cd.maturesInDays + ' days</h2><p class="small">' +
      (p.plan ? 'Plan saved: ' + m(p.plan.reserve) + ' accessible, rest to: ' + esc(p.plan.label) + '.' : 'Decide how much to keep accessible before ' + matDate(p) + '.') + '</p><button class="btn white" data-a="tab" data-v="checkup">' + (p.plan ? 'Review my plan' : 'Start my Checkup') + '</button></div>' +
      '<div class="card"><div class="between"><h3>Accounts</h3><span class="small muted">Total ' + m(p.checking + p.savings + p.cd.amount) + '</span></div>' +
      acct('Key Smart Checking', '••' + p.cd.number.slice(0, 2) + '19', p.checking) + acct('Key Savings', 'Variable rate', p.savings) + acct('Certificate of Deposit', '••' + p.cd.number + ' · ' + pct(p.cd.apy) + ' · matures ' + matDate(p), p.cd.amount) + '</div>' +
      '<button class="gtile" data-a="game" data-v="' + rec + '"><span class="ic" style="background:' + GAMES[rec].bg + '">' + GAMES[rec].icon + '</span><span><b>Today\'s 2-minute lesson: ' + GAMES[rec].name + '</b><small>Learn: ' + GAMES[rec].learn + '</small></span><span class="st">' + ((gday()[rec] || {}).done ? '<span class="chip ok">Done</span>' : '<span class="chip red">Play</span>') + '</span></button>' +
      '<div class="card"><h3>Recent activity</h3>' + (p.prefs.insights ? '' : '<p class="note" style="margin-top:0">Activity insights are off. MyKey does not use this list.</p>') +
      activity.map(a => '<div class="acct"><span><b class="small">' + esc(a.desc) + '</b><small>' + fmtDate(Date.now() - a.d * DAY) + '</small></span><span class="small" style="font-weight:700">' + (a.amt < 0 ? '-' : '+') + m2(Math.abs(a.amt)) + '</span></div>').join('') + '</div>' +
      '<button class="btn ghost" data-a="tab" data-v="mykey">💬 Ask MyKey</button></div>';
  }
  const acct = (name, sub, bal) => '<div class="acct"><span><b>' + name + '</b><small>' + esc(sub) + '</small></span><span class="mid" style="font-size:17px">' + m2(bal) + '</span></div>';

  /* ================= checkup ================= */
  function checkup() {
    const p = me(), w = work(p);
    return '<div class="main" id="main"><div class="kicker">MyKey Savings Checkup</div><h1 class="hi">What\'s next for your ' + m(p.cd.amount) + '?</h1><p class="muted small">CD ••' + p.cd.number + ' matures ' + matDate(p) + '. Goal: ' + esc(p.goal) + (p.goalConfirmed ? ' ✓' : '') + '</p>' +
      '<div class="card"><h3>1. Keep what you need accessible</h3><p class="small muted" style="margin:6px 0">When might you need it?</p><div class="seg" role="group" aria-label="When">' + [3, 6, 12].map(n => '<button class="' + (w.months == n ? 'on' : '') + '" data-a="months" data-v="' + n + '">' + (n === 3 ? 'Within 3 mo' : 'In ' + n + ' mo') + '</button>').join('') + '</div>' +
      '<label class="lbl" for="r-reserve">Keep accessible<output data-out="res">' + m(w.reserve) + '</output></label><input id="r-reserve" type="range" min="0" max="' + p.cd.amount + '" step="250" value="' + w.reserve + '" data-live="reserve"><div class="rl"><span>$0</span><span>Goal ' + m(p.goalAmount) + '</span><span>' + m(p.cd.amount) + '</span></div>' +
      '<div data-out="figs">' + ckFigs(p) + '</div></div>' +
      '<div class="card"><h3>2. Choose what to do with the rest</h3><p class="note" style="margin:0">Estimated interest per year. Illustrative rates, not KeyBank offers.</p><div class="opts" data-out="opts">' + ckOpts(p) + '</div></div>' +
      '<div class="card"><h3>3. Stress-test it</h3><label class="lbl" for="r-expense">Surprise expense<output data-out="exp">' + m(w.expense) + '</output></label><input id="r-expense" type="range" min="0" max="' + p.cd.amount + '" step="250" value="' + w.expense + '" data-live="expense"><div data-out="stress">' + ckStress(p) + '</div></div>' +
      '<div class="card" data-out="sum">' + ckSummary(p) + '</div>' +
      '<button class="btn dark" data-a="sheet" data-v="banker">Talk it through with a banker</button>' +
      (db.appointments.filter(a => a.profileId === p.id).map(a => '<p class="note">Banker request ' + esc(a.status.toLowerCase()) + ': ' + esc(a.method) + ', ' + esc(a.slot) + '</p>').join('')) +
      '<p class="note" style="text-align:center"><a href="https://www.key.com/personal/cd/certificate-of-deposit.html" target="_blank" rel="noopener">Official KeyBank CD information ↗</a></p></div>';
  }
  function ckFigs(p) {
    const w = work(p), rest = p.cd.amount - w.reserve, share = p.cd.amount ? w.reserve / p.cd.amount * 100 : 0;
    return '<div class="stat2"><div><b>' + m(w.reserve) + '</b><span>keep accessible</span></div><div><b>' + m(rest) + '</b><span>for a term product</span></div></div><div class="bar"><i style="width:' + share + '%"></i><i class="g" style="width:' + (100 - share) + '%"></i></div>' +
      '<p class="small" style="margin-top:8px">' + (w.reserve >= p.goalAmount ? '✅ Covers your ' + m(p.goalAmount) + ' goal.' : '⚠️ ' + m(p.goalAmount - w.reserve) + ' short of your ' + m(p.goalAmount) + ' goal.') + ' ' +
      (w.months <= 3 ? 'For money needed within 3 months, savings avoids penalty risk.' : w.months <= 6 ? 'Keep it accessible or use a term that ends before then.' : 'A short CD or ladder step that ends before then also works.') + '</p>';
  }
  function ckOpts(p) {
    const w = work(p);
    return options(p).map(o => '<button class="opt' + (w.choice === o.id ? ' on' : '') + '" data-a="choice" data-v="' + o.id + '"><span><b>' + o.name + '</b><small>' + o.sub + (o.rate ? ' · ' + pct(o.rate) : '') + '</small></span><em>' + (o.dest === 'out' ? '<span class="small muted">Leaves</span>' : '+' + m(o.interest) + '/yr') + '</em></button>').join('');
  }
  function ckStress(p) {
    const w = work(p), short = Math.max(0, w.expense - w.reserve), o = options(p).find(x => x.id === w.choice);
    let msg;
    if (!short) msg = '<span class="chip ok">Covered</span> Your reserve covers it with ' + m(w.reserve - w.expense) + ' to spare.';
    else if (o.id === 'savings' || o.id === 'flex') msg = '<span class="chip warn">Short ' + m(short) + '</span> But your pick keeps the rest reachable' + (o.id === 'flex' ? ' after its initial period' : '') + '.';
    else if (o.id === 'out') msg = '<span class="chip warn">Short ' + m(short) + '</span> You would cover it from money outside KeyBank.';
    else msg = '<span class="chip red">Short ' + m(short) + '</span> Breaking the CD early could cost about ' + m2(penalty(short, o.rate)) + ' (illustrative ' + db.rates.penaltyDays + '-day penalty). Try a bigger reserve.';
    return '<p class="small" style="margin:8px 0 0">' + msg + '</p>';
  }
  function ckSummary(p) {
    const w = work(p), rest = p.cd.amount - w.reserve, o = options(p).find(x => x.id === w.choice), sav = w.reserve * db.rates.savings / 100;
    return '<div class="kicker">Your plan</div><h2 style="margin-top:4px">' + m(w.reserve) + ' accessible, ' + m(rest) + ' to ' + esc(o.name.toLowerCase()) + '</h2><p class="small muted">Estimated interest over 12 months: <b>' + m(sav + o.interest) + '</b></p>' +
      (o.id === 'out' ? '<p class="small" style="background:var(--warnbg);padding:10px;border-radius:12px">Moving ' + m(rest) + ' out gives up about ' + m(rest * rateFor(p.cd.termMonths) / 100) + ' a year at the illustrative renewal rate. A banker can help you compare first.</p>' : '') +
      '<button class="btn" data-a="lock">' + (p.plan ? 'Update my plan' : 'Lock in my plan') + '</button><p class="note" style="text-align:center">' + (p.plan ? 'Saved ' + fmtTime(p.plan.at) + '.' : 'Nothing moves until ' + matDate(p) + '.') + '</p>';
  }

  /* ================= MyKey chat ================= */
  function chat() {
    const p = me(); greet(p);
    const bot = (c) => '<div class="who"><i></i>MyKey · prototype</div><div class="msg bot">' + esc(c.text) +
      ((c.banker || c.toCheckup || c.toPlay) ? '<div class="row" style="margin-top:8px;flex-wrap:wrap">' + (c.toCheckup ? '<button class="btn sm" data-a="tab" data-v="checkup">Open Checkup</button>' : '') + (c.toPlay ? '<button class="btn sm" data-a="tab" data-v="play">Open Learn</button>' : '') + (c.banker ? '<button class="btn sm ghost" data-a="sheet" data-v="banker">Request a banker</button>' : '') + '</div>' : '') +
      (c.intent && c.intent !== 'hello' ? '<div class="note" style="margin-top:6px">' + (c.approved ? 'Reviewed answer · ' : '') + 'Confirm details in your CD terms · ' + (c.flagged ? 'Sent for review' : c.rated ? 'Thanks!' : '<button class="linkish" data-a="rate" data-v="' + c.id + '">Helpful</button> · <button class="linkish" data-a="flag" data-v="' + c.id + '">Flag: unclear</button>') + '</div>' : '') + '</div>';
    return '<div class="main" id="main"><div class="thread">' + p.chat.map(c => c.who === 'me' ? '<div class="msg me">' + esc(c.text) + '</div>' : bot(c)).join('') + '</div>' +
      '<div class="chips" aria-label="Suggestions">' + CHIPS.map(([k, l]) => '<button data-a="chip" data-v="' + k + '">' + l + '</button>').join('') + '</div></div>' +
      '<form class="ask" data-f="ask"><label class="sr" for="q">Message MyKey</label><input id="q" name="q" autocomplete="off" placeholder="Ask about your CD, or tell me your goal"><button aria-label="Send">↑</button></form>';
  }

  /* ================= me: messages + privacy ================= */
  function meScreen() {
    const p = me(), pr = p.prefs, inbox = p.inbox.slice().sort((a, b) => b.at - a.at);
    const sw = (k, t, d) => '<div class="toggle"><div><b class="small">' + t + '</b><p>' + d + '</p></div><span class="sw"><input type="checkbox" data-pref="' + k + '"' + (pr[k] ? ' checked' : '') + ' aria-label="' + t + '"><span></span></span></div>';
    return '<div class="main" id="main"><div class="kicker">Me</div><h1 class="hi">' + esc(p.name) + '</h1><p class="muted small">' + esc(p.segment) + '</p>' +
      '<div class="card"><h3>Messages</h3>' + (inbox.length ? inbox.map(x => '<div class="inbox' + (x.read ? '' : ' unread') + '"><div class="between small muted"><span>' + esc(x.from) + '</span><span>' + fmtTime(x.at) + '</span></div><b>' + esc(x.subject) + '</b><p class="small" style="margin:4px 0 8px">' + esc(x.body) + '</p>' +
        (x.kind === 'outreach' ? (x.response ? '<span class="chip ok">You responded: ' + esc(x.response) + '</span>' : '<div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn sm" data-a="reply" data-v="' + x.id + '" data-r="Opened Checkup">Open Checkup</button><button class="btn sm ghost" data-a="reply" data-v="' + x.id + '" data-r="Requested a banker">Have a banker call</button><button class="btn sm ghost" data-a="reply" data-v="' + x.id + '" data-r="Not interested">Not now</button></div>') : '') +
        (!x.read && x.kind !== 'outreach' ? '<button class="linkish" data-a="read" data-v="' + x.id + '">Mark as read</button>' : '') + '</div>').join('') : '<p class="small muted" style="margin:0">No messages yet. Outreach a banker sends from the desktop console shows up here.</p>') + '</div>' +
      '<div class="card"><h3>Privacy & preferences</h3>' + sw('personalized', 'Personalized MyKey outreach', 'Let a banker or MyKey reach out with suggestions based on your goal.') + sw('insights', 'Use account activity', 'When off, only balances, CD terms and your stated goal are used.') +
      sw('app', 'In-app messages', 'Messages land in this inbox.') + sw('email', 'Email', 'Send a copy by email.') + sw('sms', 'Text message', 'Short reminders only, never sign-in links.') +
      '<p class="small" style="font-weight:700;margin:12px 0 6px">Remind me before my CD matures</p><div class="seg">' + [30, 14, 7].map(d => '<button class="' + (pr.leadDays == d ? 'on' : '') + '" data-a="lead" data-v="' + d + '">' + d + ' days</button>').join('') + '</div>' +
      '<p class="small" style="font-weight:700;margin:12px 0 6px">How MyKey explains things</p><div class="seg"><button class="' + (pr.detail === 'plain' ? 'on' : '') + '" data-a="detail" data-v="plain">Short</button><button class="' + (pr.detail === 'detailed' ? 'on' : '') + '" data-a="detail" data-v="detailed">With numbers</button></div></div>' +
      '<form class="card" data-f="goal"><h3>Your savings goal</h3><p class="note" style="margin-top:0">Bankers only see a goal you confirmed.</p>' + fld('Goal', 'goal', p.goal) + fld('Amount ($)', 'goalAmount', p.goalAmount, 'number', 'min="0" step="100" inputmode="numeric"') + '<button class="btn" style="margin-top:12px">' + (p.goalConfirmed ? 'Update goal' : 'Confirm goal') + '</button></form>' +
      '<div class="card"><button class="between linkish" style="width:100%;text-decoration:none" data-a="knows"><h3 style="margin:0">What MyKey knows about you</h3><span>' + (ui.openKnows ? '−' : '+') + '</span></button>' +
      (ui.openKnows ? '<pre class="json">' + esc(JSON.stringify({ name: p.name, goal: p.goal, goalConfirmed: p.goalConfirmed, cd: p.cd, preferences: p.prefs, savedPlan: p.plan, activityUsed: p.prefs.insights ? recentTransfers(p).length + ' recent transfers' : 'none' }, null, 2)) + '</pre><button class="btn sm ghost" data-a="clearchat">Delete my MyKey chat history</button>' : '') + '</div>' +
      '<div class="card"><h3>About this prototype</h3><p class="small">The MyKey Savings Checkup as it could live inside the KeyBank app. Built for a student case competition. Scripted answers, fictional customers, illustrative rates.</p><a class="btn sm ghost" href="../index.html">Open desktop prototype + banker console</a></div>' +
      '<button class="btn dark" data-a="signout">Sign off</button><button class="btn ghost" style="margin-top:10px" data-a="reset">Reset demo</button></div>';
  }

  /* ================= Learn: educational mini games ================= */
  // Designed around real saver situations (rate shopping, a maturing CD, uneven income),
  // without sorting anyone into a type. Each game: Learn card -> play with explanations -> takeaways -> into the Checkup.
  const GAMES = {
    keyword: { name: 'Keyword', icon: '🔤', bg: '#e6f4ea', tag: 'Guess the money word in 6 tries', learn: 'the words on your statements',
      lesson: 'Every day is a new banking word. After you play, you get a plain-English definition and how it shows up in your own accounts.' },
    dive: { name: 'Deep Save', icon: '🌊', bg: '#e3f1fb', tag: '7 timed questions. Dive as deep as you can', learn: 'savings basics in 7 questions',
      lesson: 'Seven quick questions on CDs, penalties, insurance and emergency funds. Faster right answers dive deeper, and every answer is explained.' },
    rate: { name: 'Rate or Hype?', icon: '🧠', bg: '#fdeeee', tag: 'Spot offers that are not what they seem', learn: 'how to compare rates in dollars',
      lesson: 'A higher number is not always more money. Judge the true value: how long the rate lasts, how much it applies to, and what you would actually earn in dollars.',
      takeaways: ['Turn any rate into dollars: balance × rate.', 'Ask what the rate becomes after a promo ends.', 'Check caps and minimums before switching.'] },
    ladder: { name: 'Ladder Up', icon: '🪜', bg: '#fff3df', tag: 'Build a CD ladder that pays when bills come', learn: 'matching CD terms to when you need cash',
      lesson: 'Longer CDs usually pay more, but money locked past the day you need it can cost an early-withdrawal penalty. A ladder matches each term to a date.',
      takeaways: ['Match each CD term to when you need that money.', 'Penalties can wipe out the extra rate.', 'A ladder gives regular access and still locks in rates.'] },
    lean: { name: 'Lean Month', icon: '🛟', bg: '#efeafc', tag: 'Six months of uneven pay. Avoid overdrafts', learn: 'why an accessible reserve matters',
      lesson: 'When income changes month to month, a fixed savings amount can cause overdrafts. Saving a percent and keeping a cushion handles the swings.',
      takeaways: ['Save more in strong months, less in slow ones.', 'A cushion in checking or savings prevents overdraft fees.', 'Size your accessible reserve before locking money in a CD.'] }
  };
  const gday = () => (G.days[TODAY] = G.days[TODAY] || {});
  const recGame = () => { const order = ['ladder', 'rate', 'lean', 'keyword', 'dive']; return order.find(k => !(gday()[k] || {}).done) || order[DAYNUM % order.length]; };
  const BADGES = [['first', '🎓 First lesson'], ['streak3', '🔥 3-day streak'], ['kw3', '🔤 Keyword in 3'], ['deep', '🌊 Past 450 m'], ['rh5', '🧠 5/5 Rate or Hype'], ['ladder', '🪜 Perfect ladder'], ['lean', '🛟 No overdrafts'], ['plan', '✅ Locked a plan']];
  function badge(id) { if (!G.badges[id]) { G.badges[id] = TODAY; const b = BADGES.find(x => x[0] === id); setTimeout(() => toast('Badge earned: ' + b[1]), 450); } }
  function finishGame(id, result) {
    gday()[id] = Object.assign({ done: true }, result);
    if (G.streak.last !== TODAY) { G.streak.count = G.streak.last === YESTERDAY ? G.streak.count + 1 : 1; G.streak.last = TODAY; }
    badge('first'); if (G.streak.count >= 3) badge('streak3');
    const p = me(); if (p) log(p.name, 'Completed Learn game: ' + GAMES[id].name);
    save();
  }
  function learnHub() {
    const d = gday(), rec = recGame();
    const tile = k => { const g = GAMES[k], r = d[k]; return '<button class="gtile" data-a="game" data-v="' + k + '"><span class="ic" style="background:' + g.bg + '">' + g.icon + '</span><span><b>' + g.name + '</b><small>Learn ' + g.learn + '</small></span><span class="st">' + (r && r.done ? '<span class="chip ok">' + (r.label || 'Done') + '</span>' : '<span class="chip">Play</span>') + '</span></button>'; };
    return '<div class="main" id="main"><div class="kicker">MyKey Learn</div><h1 class="hi">2-minute money lessons</h1>' +
      '<div class="card dark streak"><span class="flame">🔥</span><div><b style="font-size:20px">' + G.streak.count + '-day streak</b><p class="small" style="margin:0;color:#ccc">Each game teaches one idea from your Checkup, then takes you there.</p></div></div>' +
      '<h3>Up next</h3>' + tile(rec) + '<h3 style="margin-top:14px">All lessons</h3>' + Object.keys(GAMES).filter(k => k !== rec).map(tile).join('') +
      '<h3 style="margin-top:14px">Badges</h3><div class="badges">' + BADGES.map(([k, l]) => '<span class="badge' + (G.badges[k] ? ' got' : '') + '">' + l + '</span>').join('') + '</div></div>';
  }
  function gameShell(k, body) {
    const g = GAMES[k];
    return '<div class="main" id="main"><div class="gamehead"><button class="back" data-a="exitgame" aria-label="Back">←</button><div><b>' + g.icon + ' ' + g.name + '</b><div class="small muted">' + g.tag + '</div></div></div>' + body + '</div>';
  }
  const learnCard = k => '<div class="card" style="border-left:5px solid var(--red)"><div class="kicker">Learn first</div><p class="small" style="margin:4px 0 0">' + GAMES[k].lesson + '</p></div>';
  const takeaways = (k, extra) => '<div class="card" style="background:var(--tint)"><div class="kicker">What you learned</div><ul class="list">' + (extra || GAMES[k].takeaways).map((t, i) => '<li><b>' + (i + 1) + '</b>' + t + '</li>').join('') + '</ul><button class="btn sm" style="margin-top:10px" data-a="tieplan">Use it in my Checkup →</button></div>';

  /* ---- Keyword ---- */
  const WORDS = [['YIELD', 'What your money earns, shown as a yearly percent.', 'Compare the yield on savings vs. a CD in your Checkup.'], ['TERMS', 'The rules of an account: rate, length and penalties.', 'Your CD terms list the exact early-withdrawal penalty.'], ['RATES', 'The percent a bank pays you. Savings rates can change; CD rates are locked.', 'A CD locks your rate until maturity, even if rates fall.'], ['FUNDS', 'Money available to use. "Available funds" can differ from your balance.', 'Deposits can take time to become available funds.'], ['ASSET', 'Something you own that holds value, like savings or a CD.', 'Your CD is an asset that pays interest.'], ['DEBIT', 'Money leaving your account.', 'Transfers out show up as debits on your activity.'], ['BONDS', 'Loans you make to a government or company in exchange for interest.', 'CDs are bank deposits; bonds are not FDIC insured.'], ['GOALS', 'Named targets that make saving easier to stick with.', 'Telling MyKey your goal sizes your accessible reserve.'], ['LOANS', 'Money you borrow and repay with interest.', 'Breaking a CD early is usually cheaper than a high-rate loan, but check the penalty.'], ['VAULT', 'Where banks kept cash. Today, any money you set aside.', 'Your accessible reserve is your vault for surprises.']];
  const WORD = WORDS[DAYNUM % WORDS.length];
  function kwEval(g) {
    const a = WORD[0].split(''), res = Array(5).fill('a'), left = {};
    a.forEach((ch, i) => { if (g[i] === ch) res[i] = 'c'; else left[ch] = (left[ch] || 0) + 1; });
    g.split('').forEach((ch, i) => { if (res[i] !== 'c' && left[ch]) { res[i] = 'p'; left[ch]--; } });
    return res;
  }
  function keyword() {
    const st = gday().keyword || { guesses: [] }, done = st.done, rows = [], keys = {}, rank = { c: 3, p: 2, a: 1 };
    for (let r = 0; r < 6; r++) {
      const g = st.guesses[r];
      if (g) { const ev = kwEval(g); g.split('').forEach((ch, i) => { if (!keys[ch] || rank[ev[i]] > rank[keys[ch]]) keys[ch] = ev[i]; }); rows.push('<div class="kw-row">' + g.split('').map((ch, i) => '<div class="kw-cell ' + ev[i] + '">' + ch + '</div>').join('') + '</div>'); }
      else if (r === st.guesses.length && !done) rows.push('<div class="kw-row" id="kwcur">' + [0, 1, 2, 3, 4].map(i => '<div class="kw-cell' + (ui.kw[i] ? ' f' : '') + '">' + (ui.kw[i] || '') + '</div>').join('') + '</div>');
      else rows.push('<div class="kw-row">' + '<div class="kw-cell"></div>'.repeat(5) + '</div>');
    }
    let body = (st.guesses.length ? '' : learnCard('keyword')) + '<div class="kw-grid" aria-live="polite">' + rows.join('') + '</div>';
    if (!done && st.guesses.length >= 3) body += '<p class="small" style="text-align:center;margin-top:-6px">💡 Hint: ' + WORD[1] + '</p>';
    if (done) body += '<div class="card pop"><h2>' + (st.won ? 'Got it in ' + st.guesses.length + '! 🎉' : 'The word was ' + WORD[0]) + '</h2><button class="btn sm ghost" data-a="share">Share result</button></div>' + takeaways('keyword', ['<b>' + WORD[0] + ':</b> ' + WORD[1], WORD[2]]);
    else body += '<div class="kb">' + ['QWERTYUIOP', 'ASDFGHJKL', '>ZXCVBNM<'].map(r => '<div>' + r.split('').map(ch => ch === '>' ? '<button class="wide" data-a="kw" data-v="ENTER">ENTER</button>' : ch === '<' ? '<button class="wide" data-a="kw" data-v="DEL" aria-label="Delete">⌫</button>' : '<button class="' + (keys[ch] || '') + '" data-a="kw" data-v="' + ch + '">' + ch + '</button>').join('') + '</div>').join('') + '</div>';
    return gameShell('keyword', body);
  }
  function kwKey(k) {
    const st = gday().keyword = gday().keyword || { guesses: [] };
    if (st.done) return;
    if (k === 'DEL') ui.kw = ui.kw.slice(0, -1);
    else if (k === 'ENTER') {
      if (ui.kw.length < 5) { const r = $('kwcur'); if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); } toast('Not enough letters'); return; }
      st.guesses.push(ui.kw); ui.kw = '';
      const won = st.guesses[st.guesses.length - 1] === WORD[0];
      if (won || st.guesses.length === 6) { finishGame('keyword', { guesses: st.guesses, won, label: won ? st.guesses.length + '/6' : 'X/6' }); if (won && st.guesses.length <= 3) badge('kw3'); }
      save();
    } else if (/^[A-Z]$/.test(k) && ui.kw.length < 5) ui.kw += k;
    render(true);
  }

  /* ---- Deep Save ---- */
  const QS = [
    ['A 12-month CD at 4% on $5,000 earns about how much in a year?', ['$20', '$200', '$400', '$2,000'], 1, '$5,000 × 4% = $200. Multiply the balance by the rate to get dollars.'],
    ['What usually happens if you take money out of a CD early?', ['Nothing', 'You pay a penalty', 'Your rate goes up', 'You get a bonus'], 1, 'Most CDs charge a set number of days of interest. Keep money you might need in savings.'],
    ['An emergency fund is often how many months of expenses?', ['One week', '3 to 6 months', '5 years', 'None needed'], 1, 'Three to six months of expenses is a common starting target.'],
    ['A "teaser" rate is…', ['A rate that lasts forever', 'A high intro rate that drops later', 'A monthly fee', 'A type of loan'], 1, 'Always ask what the rate becomes after the promo ends.'],
    ['A CD ladder helps you…', ['Get money back at regular intervals', 'Avoid all interest', 'Borrow more', 'Skip taxes'], 0, 'Staggered terms mean part of your money matures every few months.'],
    ['With uneven income, saving a percent of each deposit…', ['Saves the same dollars every month', 'Saves more in big months, less in slow ones', 'Stops all saving', 'Costs a fee'], 1, 'A percent flexes with income, so slow months do not cause overdrafts.'],
    ['FDIC insurance covers deposits up to how much per depositor, per bank, per ownership category?', ['$25,000', '$100,000', '$250,000', 'Unlimited'], 2, 'The standard limit is $250,000.'],
    ['Moving $6,000 from 3.25% to 4.10% earns about how much more per year?', ['$5', '$51', '$510', '$5,100'], 1, '$6,000 × 0.85% ≈ $51 a year, about $4 a month.'],
    ['A CD "grace period" is…', ['A short window after maturity to change or withdraw', 'A late fee', 'A bonus rate', 'A loan term'], 0, 'Your CD terms say how long yours lasts. The Checkup helps you decide before it starts.'],
    ['"APY" includes the effect of…', ['Compounding', 'Taxes', 'Inflation', 'ATM fees'], 0, 'APY reflects interest earning interest over a year.'],
    ['If rates are expected to fall, locking part of your savings in a CD…', ['Keeps today\'s rate until maturity', 'Lowers your rate right away', 'Makes it uninsured', 'Has no effect'], 0, 'A fixed CD rate does not change until maturity.']
  ];
  const ZONES = [[0, 'Checking shallows'], [150, 'Savings reef'], [300, 'CD canyon'], [450, 'Ladder trench'], [600, 'Vault floor']];
  const zoneName = s => ZONES.filter(z => s >= z[0]).pop()[1];
  function stopTick() { if (ui.tick) clearInterval(ui.tick); ui.tick = null; }
  function startTick() {
    stopTick();
    ui.tick = setInterval(() => {
      const d = ui.dive; if (!d || d.picked !== null) return;
      d.left--; const t = $('tbar'), s = $('tsec'); if (t) t.style.width = (d.left / 20 * 100) + '%'; if (s) s.textContent = d.left + 's';
      if (d.left <= 0) { d.picked = -1; d.missed.push(d.qs[d.i]); render(true); }
    }, 1000);
  }
  function dive() {
    const done = gday().dive, depth = done ? done.score : ui.dive ? ui.dive.score : 0;
    const ocean = '<div class="ocean" aria-label="Depth ' + depth + ' meters">' + ZONES.map(([z, n]) => '<div class="z" style="top:' + (6 + z / 700 * 88) + '%">' + n + '</div>').join('') + '<div class="diver" style="top:' + (6 + depth / 700 * 88) + '%">🤿</div></div>';
    let right;
    if (done) right = '<div class="big">' + done.score + ' m</div><p class="muted small">' + zoneName(done.score) + '</p><p class="small">' + done.correct + ' of 7 correct.</p><button class="btn sm ghost" data-a="share">Share</button>';
    else if (!ui.dive) right = '<h2>Ready?</h2><p class="small muted">7 questions, 20 seconds each. 700 m is the vault floor.</p><button class="btn" data-a="divego">Start dive</button>';
    else {
      const d = ui.dive, q = QS[d.qs[d.i]];
      right = '<div class="between small"><b>Q' + (d.i + 1) + ' of 7</b><span id="tsec">' + d.left + 's</span></div><div class="timer"><i id="tbar" style="width:' + (d.left / 20 * 100) + '%"></i></div><p style="font-weight:700;font-size:15px">' + q[0] + '</p>' +
        q[1].map((o, i) => '<button class="qopt' + (d.picked !== null ? (i === q[2] ? ' right' : i === d.picked ? ' wrong' : '') : '') + '" data-a="divepick" data-v="' + i + '"' + (d.picked !== null ? ' disabled' : '') + '>' + o + '</button>').join('') +
        (d.picked !== null ? '<p class="small">' + (d.picked === -1 ? '⏱ Time\'s up. ' : d.picked === q[2] ? '✅ ' : '❌ ') + q[3] + '</p><button class="btn sm" data-a="divenext">' + (d.i < 6 ? 'Next' : 'Surface') + '</button>' : '');
    }
    const learned = done ? takeaways('dive', (done.review && done.review.length ? done.review.slice(0, 3).map(i => QS[i][3]) : ['You know your savings basics. Put them to work.', 'Keep what you might need accessible; lock in the rest.'])) : '';
    return gameShell('dive', (!ui.dive && !done ? learnCard('dive') : '') + '<div class="dive">' + ocean + '<div>' + right + '</div></div>' + (done ? '<p class="small muted" style="margin-top:12px">' + (done.review && done.review.length ? 'Review the ones you missed:' : '') + '</p>' + learned : ''));
  }

  /* ---- Rate or Hype ---- */
  const OFFERS = [
    ['5.25% APY!*', '*for 3 months, then 3.00%', false, 'Blended over a year that is about 3.56%. On $6,000: about $214, less than a steady 4% ($240).'],
    ['4.10% APY savings', 'No minimum, FDIC insured', true, 'A real gap: about $51 more a year on $6,000 vs. 3.25%. Worth weighing against transfer time and switching hassle.'],
    ['$300 bonus', 'Move $15,000 and keep it 90 days', false, 'With $6,000 you would not qualify. Read the fine print before chasing a bonus.'],
    ['6.00% APY', 'On your first $500 only', false, 'Max $30 a year. Everything above $500 earns much less.'],
    ['Round-ups to savings', 'Spare change from every purchase', true, 'Small but automatic, often $25 to $40 a month. Habits usually beat rate-chasing.']
  ];
  function rate() {
    const done = gday().rate, s = ui.rh || (ui.rh = { i: 0, right: 0, ans: null });
    if (done) return gameShell('rate', '<div class="card pop" style="text-align:center"><div class="big">' + done.right + '/5</div><p>' + (done.right === 5 ? 'Perfect. No hype gets past you.' : 'Nice. Teaser rates are tricky.') + '</p><button class="btn sm ghost" data-a="share">Share</button></div>' + takeaways('rate'));
    const o = OFFERS[s.i];
    return gameShell('rate', (s.i === 0 && s.ans === null ? learnCard('rate') : '') + '<div class="between small"><b>Offer ' + (s.i + 1) + ' of 5 · you have $6,000</b><span>' + s.right + ' right</span></div>' +
      '<div class="offer"><div class="kicker">Spotted online</div><div class="ad">' + o[0] + '</div><div class="muted small">' + o[1] + '</div>' +
      (s.ans !== null ? '<p class="small" style="margin-top:14px">' + (s.ans === o[2] ? '✅ ' : '❌ ') + '<b>' + (o[2] ? 'Worth it.' : 'Hype.') + '</b> ' + o[3] + '</p>' : '') + '</div>' +
      (s.ans === null ? '<div class="two"><button class="btn ghost" data-a="rh" data-v="0">Hype</button><button class="btn" data-a="rh" data-v="1">Worth it</button></div>' : '<button class="btn" data-a="rhnext">' + (s.i < 4 ? 'Next offer' : 'See score') + '</button>'));
  }

  /* ---- Ladder Up ---- */
  const LRATES = { 3: 3.0, 6: 3.4, 9: 3.7, 12: 4.0, 18: 4.2 }; // practice rates for the game only
  const NEEDS = [3, 6, 9, 12];
  const ladderScore = picks => picks.map((t, i) => { const need = NEEDS[i], r = LRATES[t] / 100; return t > need ? { ok: false, v: 3000 * r * need / 12 - 3000 * r * db.rates.penaltyDays / 365 } : { ok: true, v: 3000 * r * t / 12 }; });
  function ladder() {
    const done = gday().ladder, picks = (ui.lad = ui.lad || [0, 0, 0, 0]), best = ladderScore(NEEDS).reduce((a, b) => a + b.v, 0), res = done ? ladderScore(done.picks) : null;
    let body = (done ? '' : learnCard('ladder')) + '<div class="card"><p class="small" style="margin:0">You have <b>$12,000</b> and a <b>$3,000</b> bill every 3 months. Pick a CD term for each chunk. Practice rates: ' + Object.entries(LRATES).map(([t, r]) => t + 'mo ' + r + '%').join(', ') + '.</p></div>';
    body += NEEDS.map((n, i) => '<div class="rung"><div class="between"><b>$3,000 due in month ' + n + '</b>' + (res ? (res[i].ok ? '<span class="chip ok">+' + m(res[i].v) + '</span>' : '<span class="chip warn">Penalty</span>') : '') + '</div><div class="terms">' +
      Object.keys(LRATES).map(t => '<button class="' + ((done ? done.picks : picks)[i] == t ? (res && !res[i].ok ? 'on bad' : 'on') : '') + '" data-a="lad" data-i="' + i + '" data-v="' + t + '"' + (done ? ' disabled' : '') + '>' + t + 'mo</button>').join('') + '</div>' +
      (res && !res[i].ok ? '<p class="note">Still locked when the bill came, so you paid an early-withdrawal penalty.</p>' : '') + '</div>').join('');
    if (done) body += '<div class="card pop" style="text-align:center"><div class="big">' + '⭐'.repeat(done.stars) + '</div><p>Earned ' + m(done.total) + ' of a possible ' + m(best) + '.</p><button class="btn sm ghost" data-a="share">Share</button></div>' + takeaways('ladder');
    else body += '<button class="btn" data-a="ladgo"' + (picks.every(Boolean) ? '' : ' disabled') + '>Check my ladder</button>';
    return gameShell('ladder', body);
  }

  /* ---- Lean Month ---- */
  const LEAN_BILLS = 3600, LEAN_BASE = [3200, 5100, 2400, 4600, 2900, 6100];
  const leanIncomes = () => shuffle(LEAN_BASE, DAYNUM + 7).map((x, i) => Math.round((x + (rng(DAYNUM + i)() - 0.5) * 600) / 50) * 50);
  function lean() {
    const done = gday().lean;
    if (done) return gameShell('lean', '<div class="card pop" style="text-align:center"><div class="big">' + '⭐'.repeat(done.stars) + '</div><p>Saved <b>' + m(done.saved) + '</b> with ' + done.od + ' overdraft' + (done.od === 1 ? '' : 's') + ' (' + m(done.od * 35) + ' in fees).</p><button class="btn sm ghost" data-a="share">Share</button></div>' + takeaways('lean'));
    const inc = leanIncomes(), s = ui.lm || (ui.lm = { m: 0, cushion: 1000, saved: 0, od: 0, log: [] }), x = inc[s.m];
    return gameShell('lean', (s.m === 0 ? learnCard('lean') : '') + '<div class="stat2"><div><b>' + m(s.cushion) + '</b><span>cushion (checking)</span></div><div><b>' + m(s.saved) + '</b><span>saved</span></div></div>' +
      '<div class="card"><div class="kicker">Month ' + (s.m + 1) + ' of 6</div><div class="big" style="margin:6px 0">' + m(x) + '</div><p class="small muted">came in. Bills are ' + m(LEAN_BILLS) + '. Overdrafts cost $35.</p>' +
      '<p style="font-weight:700;margin-bottom:8px">How much do you save?</p><div class="opts">' + [20, 10, 0].map(p => '<button class="opt" data-a="lm" data-v="' + p + '"><span><b>Save ' + p + '%</b><small>' + m(x * p / 100) + ' to savings, ' + m(x - LEAN_BILLS - x * p / 100) + ' left after bills</small></span></button>').join('') + '</div></div>' +
      (s.last ? '<p class="small">' + s.last + '</p>' : ''));
  }

  /* ================= sheets ================= */
  function sheet() {
    if (!ui.sheet) return '';
    let h = '';
    if (ui.sheet === 'about') h = '<div class="kicker">Prototype</div><h2>Built into MyKey</h2><p class="small">This is the MyKey Savings Checkup as it could live inside the KeyBank mobile app: plan your CD maturity, ask MyKey, and learn with 2-minute games.</p><p class="small muted">Student case competition demo. Fictional data, scripted answers, illustrative rates. Not operated by or affiliated with KeyBank.</p><button class="btn" data-a="closesheet">Got it</button>';
    if (ui.sheet === 'banker') h = '<div class="kicker">Banker request</div><h2>How should a banker reach you?</h2><p class="small">They will see your Checkup plan and recent MyKey questions, so you will not start over.</p><div class="opts">' + [['Phone call', 'Next available'], ['Video meeting', 'Tomorrow'], ['Branch visit', 'This week']].map(([a, b]) => '<button class="opt" data-a="bankerpick" data-v="' + a + '|' + b + '"><span><b>' + a + '</b><small>' + b + '</small></span></button>').join('') + '</div>';
    return '<div class="scrim" data-a="closesheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + h + '</div>';
  }

  /* ================= render ================= */
  function render(keepScroll) {
    const app = $('app'), old = $('main'), y = keepScroll && old ? old.scrollTop : 0, focus = document.activeElement && document.activeElement.id;
    const p = me();
    let body;
    if (!p) body = signOn();
    else if (ui.game) body = ({ keyword, dive, rate, ladder, lean })[ui.game]();
    else body = ({ home, checkup, mykey: chat, play: learnHub, me: meScreen })[ui.tab]();
    app.innerHTML = header() + body + (p ? tabbar() : '') + sheet();
    const main = $('main');
    if (main) main.scrollTop = keepScroll === 'bottom' ? main.scrollHeight : y;
    if (focus && $(focus)) $(focus).focus({ preventScroll: true });
  }
  function refreshCheckup() {
    const p = me(), w = work(p), set = (k, h) => { const el = document.querySelector('[data-out="' + k + '"]'); if (el) el.innerHTML = h; };
    set('res', m(w.reserve)); set('exp', m(w.expense)); set('figs', ckFigs(p)); set('opts', ckOpts(p)); set('stress', ckStress(p)); set('sum', ckSummary(p));
  }
  function signIn(id) { db.session = id; ui.tab = 'home'; ui.game = null; const p = prof(id); log(p.name, 'Signed in to MyKey mobile (demo)'); save(); render(); }
  function addAppointment(p, method, slot) {
    const w = work(p), o = options(p).find(x => x.id === w.choice), qs = p.chat.filter(c => c.who === 'me').slice(-3).map(c => '"' + c.text + '"').join(', ');
    db.appointments.push({ id: uid('a'), profileId: p.id, name: p.name, method, slot, status: 'Requested', at: Date.now(),
      context: 'Goal: ' + p.goal + (p.goalConfirmed ? ' (confirmed)' : ' (not confirmed)') + '\nCheckup: ' + m(w.reserve) + ' accessible, ' + m(p.cd.amount - w.reserve) + ' to ' + o.name.toLowerCase() + (p.plan ? ' (plan saved)' : ' (draft)') + '\nCD: ' + m(p.cd.amount) + ' matures ' + matDate(p) + (qs ? '\nRecent MyKey questions: ' + qs : '') + '\nSource: MyKey mobile' });
    log(p.name, 'Requested a banker from mobile: ' + method + ', ' + slot);
  }

  /* ================= events ================= */
  const A = {
    tab: v => { stopTick(); ui.game = null; ui.tab = v; render(v === 'mykey' ? 'bottom' : false); },
    sheet: v => { ui.sheet = v; render(true); },
    closesheet: () => { ui.sheet = null; render(true); },
    enroll: v => { ui.enroll = v === '1'; render(); },
    signin: v => signIn(v),
    signout: () => { const p = me(); if (p) log(p.name, 'Signed off mobile'); db.session = null; stopTick(); ui.game = null; save(); render(); },
    months: v => { work(me()).months = Number(v); save(); render(true); },
    choice: v => { work(me()).choice = v; save(); refreshCheckup(); },
    lock: () => {
      const p = me(), w = work(p), o = options(p).find(x => x.id === w.choice), isNew = !p.plan;
      p.plan = { reserve: w.reserve, choice: o.id, label: o.name, dest: o.dest, months: w.months, at: Date.now() };
      p.inbox.push({ id: uid('x'), kind: 'notice', from: 'MyKey', subject: 'Your Savings Checkup plan is saved', body: m(w.reserve) + ' stays accessible and ' + m(p.cd.amount - w.reserve) + ' goes to: ' + o.name + '. You can change this until ' + matDate(p) + '.', at: Date.now(), read: false });
      log(p.name, (isNew ? 'Saved' : 'Updated') + ' Checkup plan on mobile: ' + m(w.reserve) + ' accessible, rest to ' + o.name);
      badge('plan'); save(); render(true); toast('Plan saved. Confirmation in your inbox.');
    },
    bankerpick: v => { const [a, b] = v.split('|'); addAppointment(me(), a, b); ui.sheet = null; save(); render(true); toast('Banker request sent with your plan attached'); },
    chip: (v, el) => { ask(me(), el.textContent, v); render('bottom'); },
    rate: v => { const c = me().chat.find(x => x.id === v); c.rated = true; save(); render(true); },
    flag: v => {
      const p = me(), i = p.chat.findIndex(x => x.id === v), c = p.chat[i], q = p.chat[i - 1]; c.flagged = true;
      db.reviews.push({ id: uid('r'), intent: c.intent, question: q && q.who === 'me' ? q.text : '(no question)', answer: c.text, reason: 'Customer flagged this answer as unclear or wrong (mobile).', profile: p.name, status: 'pending', proposed: '', at: Date.now() });
      log(p.name, 'Flagged a MyKey answer (' + c.intent + ') for review'); save(); render(true); toast('Sent to the review queue');
    },
    reply: (v, el) => {
      const p = me(), x = p.inbox.find(i => i.id === v); x.read = true; x.response = el.dataset.r; log(p.name, 'Responded to outreach: ' + x.response);
      if (x.response === 'Requested a banker') { addAppointment(p, 'Phone call', 'Next available'); toast('A banker will call you'); }
      save(); if (x.response === 'Opened Checkup') A.tab('checkup'); else render(true);
    },
    read: v => { me().inbox.find(i => i.id === v).read = true; save(); render(true); },
    lead: v => { const p = me(); p.prefs.leadDays = Number(v); log(p.name, 'Set reminder to ' + v + ' days'); save(); render(true); },
    detail: v => { const p = me(); p.prefs.detail = v; log(p.name, 'Set explanation style to ' + v); save(); render(true); },
    knows: () => { ui.openKnows = !ui.openKnows; render(true); },
    clearchat: () => { const p = me(); p.chat = []; log(p.name, 'Deleted MyKey chat history'); save(); render(true); toast('Chat history deleted'); },
    reset: () => { if (!confirm('Reset all demo data, including the desktop prototype?')) return; stopTick(); db = clone(SEED); G = { days: {}, streak: { last: null, count: 0 }, badges: {} }; ui.game = null; save(); render(); },
    // games
    game: v => { ui.game = v; ui.kw = ''; if (v === 'dive' && !gday().dive) ui.dive = null; render(); },
    exitgame: () => { stopTick(); ui.game = null; ui.tab = 'play'; render(); },
    tieplan: () => { stopTick(); ui.game = null; ui.tab = 'checkup'; render(); },
    kw: v => kwKey(v),
    divego: () => { ui.dive = { qs: shuffle(QS.map((q, i) => i), DAYNUM).slice(0, 7), i: 0, score: 0, left: 20, picked: null, correct: 0, missed: [] }; startTick(); render(true); },
    divepick: v => { const d = ui.dive; if (d.picked !== null) return; d.picked = Number(v); if (d.picked === QS[d.qs[d.i]][2]) { d.score += 50 + Math.round(d.left * 2.5); d.correct++; } else d.missed.push(d.qs[d.i]); render(true); },
    divenext: () => {
      const d = ui.dive;
      if (d.i < 6) { d.i++; d.picked = null; d.left = 20; startTick(); render(true); return; }
      stopTick(); finishGame('dive', { score: d.score, correct: d.correct, review: d.missed, label: d.score + ' m' }); if (d.score >= 450) badge('deep'); ui.dive = null; render();
    },
    rh: v => { const s = ui.rh; s.ans = v === '1'; if (s.ans === OFFERS[s.i][2]) s.right++; render(true); },
    rhnext: () => { const s = ui.rh; if (s.i < 4) { s.i++; s.ans = null; render(true); return; } finishGame('rate', { right: s.right, label: s.right + '/5' }); if (s.right === 5) badge('rh5'); ui.rh = null; render(); },
    lad: (v, el) => { ui.lad[Number(el.dataset.i)] = Number(v); render(true); },
    ladgo: () => {
      const r = ladderScore(ui.lad), total = r.reduce((a, b) => a + b.v, 0), perfect = ui.lad.every((t, i) => t === NEEDS[i]), stars = perfect ? 3 : r.every(x => x.ok) ? 2 : 1;
      finishGame('ladder', { picks: ui.lad.slice(), total, stars, label: '⭐'.repeat(stars) }); if (perfect) badge('ladder'); ui.lad = null; render(true);
    },
    lm: v => {
      const s = ui.lm, x = leanIncomes()[s.m], sv = x * Number(v) / 100;
      s.saved += sv; s.cushion += x - LEAN_BILLS - sv;
      s.last = 'Month ' + (s.m + 1) + ': saved ' + v + '%.';
      if (s.cushion < 0) { s.od++; s.cushion -= 35; s.last += ' ⚠️ Overdraft, $35 fee. A smaller save in a slow month would have avoided it.'; }
      else if (x < LEAN_BILLS && Number(v) > 0) s.last += ' Careful: saving in a month under your bills drains your cushion.';
      else if (x > LEAN_BILLS + 1000 && Number(v) < 20) s.last += ' Strong month: saving more now builds a bigger cushion.';
      s.m++;
      if (s.m === 6) { const stars = s.od === 0 && s.saved >= 1800 ? 3 : s.od === 0 ? 2 : 1; finishGame('lean', { saved: s.saved, od: s.od, stars, label: '⭐'.repeat(stars) }); if (!s.od) badge('lean'); ui.lm = null; }
      render(true);
    },
    share: () => {
      const g = ui.game, r = gday()[g]; let txt = 'MyKey Learn · ' + GAMES[g].name + ' ' + TODAY + ': ' + (r.label || 'done');
      if (g === 'keyword') txt += '\n' + r.guesses.map(w => kwEval(w).map(e => ({ c: '🟩', p: '🟨', a: '⬜' }[e])).join('')).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Result copied'), () => toast(txt)); else toast(txt);
    }
  };
  const forms = {
    signon: f => {
      const id = f.uid.value.trim().toLowerCase(); if (!id) { toast('Enter a User ID or pick a profile'); return; }
      const p = db.profiles.find(x => x.userId.toLowerCase() === id || x.id === id || x.name.toLowerCase() === id);
      if (p) signIn(p.id); else { ui.enroll = true; render(); const u = $('f-userId'); if (u) u.value = id; toast('No profile for "' + id + '". Enroll it.'); }
    },
    enroll: f => {
      const fd = new FormData(f), name = String(fd.get('name')).trim(), userId = String(fd.get('userId')).trim();
      if (db.profiles.some(p => p.userId.toLowerCase() === userId.toLowerCase())) { toast('That User ID is taken'); return; }
      const base = name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'customer';
      const p = { id: uid(base), userId, name, initials: name.split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase(), segment: 'Demo customer', tenureYears: 3,
        goal: String(fd.get('goal') || 'Emergency savings'), goalAmount: num(fd.get('goalAmount'), 4000), needMonths: 6, checking: 2500, savings: 1000,
        cd: { amount: num(fd.get('cdAmount'), 10000), apy: 4.5, termMonths: 12, maturesInDays: num(fd.get('days'), 14), number: String(1000 + Math.floor(Math.random() * 9000)) },
        transfers: [], prefs: { personalized: fd.get('personalized') === 'on', insights: true, app: true, email: false, sms: false, leadDays: 14, detail: 'plain' },
        goalConfirmed: true, plan: null, inbox: [], chat: [], notes: '' };
      db.profiles.push(p); log(name, 'Enrolled a new demo profile on mobile'); ui.enroll = false; signIn(p.id);
    },
    ask: f => { const q = f.q.value.trim(); if (!q) return; ask(me(), q); render('bottom'); const i = $('q'); if (i) i.focus({ preventScroll: true }); },
    goal: f => { const p = me(); p.goal = f.goal.value.trim() || p.goal; p.goalAmount = num(f.goalAmount.value, p.goalAmount); p.goalConfirmed = true; delete p.work; log(p.name, 'Confirmed savings goal: ' + p.goal + ' (' + m(p.goalAmount) + ')'); save(); render(true); toast('Goal saved'); }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el || !A[el.dataset.a] || el.disabled || el.tagName === 'A') return;
    e.preventDefault(); A[el.dataset.a](el.dataset.v, el);
  });
  document.addEventListener('submit', e => { const f = e.target; if (forms[f.dataset.f]) { e.preventDefault(); forms[f.dataset.f](f); } });
  document.addEventListener('input', e => { const t = e.target, p = me(); if (t.dataset.live && p) { work(p)[t.dataset.live] = Number(t.value); save(); refreshCheckup(); } });
  document.addEventListener('change', e => {
    const t = e.target, p = me();
    if (t.dataset.live && p) log(p.name, 'Adjusted Checkup ' + t.dataset.live + ' to ' + m(t.value));
    if (t.dataset.pref && p) { p.prefs[t.dataset.pref] = t.checked; log(p.name, 'Turned ' + (t.checked ? 'on' : 'off') + ' ' + t.dataset.pref + ' preference'); save(); toast('Saved'); }
  });
  document.addEventListener('keydown', e => {
    if (ui.game === 'keyword' && !e.metaKey && !e.ctrlKey && !(gday().keyword || {}).done) {
      if (e.key === 'Enter') { e.preventDefault(); kwKey('ENTER'); } else if (e.key === 'Backspace') kwKey('DEL'); else if (/^[a-z]$/i.test(e.key)) kwKey(e.key.toUpperCase());
    }
    if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(true); }
  });

  render();

  /* QR code for judges (desktop side panel) */
  function qr() {
    const url = location.href.split('#')[0].split('?')[0];
    $('qrurl').textContent = url.replace(/^https?:\/\//, '');
    if (window.QRCode && !$('qr').firstChild) new window.QRCode($('qr'), { text: url, width: 240, height: 240, correctLevel: window.QRCode.CorrectLevel.M });
  }
  if (window.QRCode) qr(); else window.addEventListener('load', qr);
})();
