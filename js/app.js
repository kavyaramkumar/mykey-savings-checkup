'use strict';
(function () {
  /* ---------- helpers ---------- */
  const STORE = 'mykey-checkup-demo';
  const DAY = 86400000;
  const fmt0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const fmt2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const m = v => fmt0.format(Math.round(Number(v) || 0));
  const m2 = v => fmt2.format(Number(v) || 0);
  const pct = v => (Number(v) || 0).toFixed(2) + '%';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = p => p + '-' + Math.random().toString(36).slice(2, 8);
  const byId = id => document.getElementById(id);
  const fmtDate = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = t => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const matDate = p => fmtDate(Date.now() + p.cd.maturesInDays * DAY);
  const first = p => p.name.split(' ')[0];
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const keySvg = '<svg viewBox="0 0 34 16" aria-hidden="true"><circle cx="7" cy="8" r="5" fill="none" stroke="#cc0000" stroke-width="3"/><path d="M12 8h20M26 8v5M30.5 8v4" stroke="#cc0000" stroke-width="3" fill="none"/></svg>';

  /* ---------- state ---------- */
  let db = load();
  const ui = { route: 'home', sub: '', drawer: null, prefill: '', chatOpen: false, sel: null, editing: null, openMsg: null };

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) { const d = JSON.parse(raw); if (d && d.version === SEED.version && Array.isArray(d.profiles)) return d; }
    } catch (e) { /* storage blocked: fall back to seed */ }
    return clone(SEED);
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { /* ignore */ } }
  function log(who, what) { db.audit.unshift({ at: Date.now(), who, what }); db.audit = db.audit.slice(0, 250); }
  const prof = id => db.profiles.find(p => p.id === id);
  const me = () => prof(db.session);
  let toastTimer;
  function toast(text) {
    const t = byId('toast'); t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  /* ---------- domain logic ---------- */
  function work(p) {
    if (!p.work) p.work = { reserve: Math.min(p.goalAmount, p.cd.amount), months: p.needMonths, choice: 'renew', expense: Math.max(500, Math.round(p.goalAmount * 1.5 / 500) * 500) };
    p.work.reserve = Math.min(Math.max(0, p.work.reserve), p.cd.amount);
    return p.work;
  }
  const recentTransfers = p => p.transfers.filter(t => t.daysAgo <= 30);
  function score(p) {
    const r = db.rules, reasons = [];
    let s = 0;
    if (p.cd.maturesInDays <= r.windowDays) { s += r.wMaturity; reasons.push(['CD matures in ' + p.cd.maturesInDays + ' days', r.wMaturity]); }
    const tx = recentTransfers(p);
    // activity only counts when the customer allows insights
    if (p.prefs.insights && tx.length >= r.transfersMin) { s += r.wTransfers; reasons.push([tx.length + ' external transfers in 30 days', r.wTransfers]); }
    if (p.cd.amount >= r.largeBalance) { s += r.wLarge; reasons.push(['CD balance of ' + m(r.largeBalance) + ' or more', r.wLarge]); }
    if (p.tenureYears < r.newTenureYears) { s += r.wTenure; reasons.push(['Relationship under ' + r.newTenureYears + ' years', r.wTenure]); }
    return { score: Math.min(100, s), reasons };
  }
  function action(p) {
    const s = score(p).score;
    if (!p.prefs.personalized) return { key: 'paused', label: 'Consent off: standard notice only', cls: 'warn' };
    if (s >= db.rules.threshold) return { key: 'outreach', label: 'Review personalized outreach', cls: 'red' };
    return { key: 'standard', label: 'Standard maturity notice', cls: '' };
  }
  const rateFor = term => term <= 6 ? db.rates.cd6 : term <= 12 ? db.rates.cd12 : db.rates.cd18;
  function options(p) {
    const r = db.rates, w = work(p), rest = p.cd.amount - w.reserve;
    const renew = rateFor(p.cd.termMonths), ladder = (r.cd6 + r.cd12 + r.cd18) / 3;
    return [
      { id: 'renew', dest: 'cd', name: 'Renew for ' + p.cd.termMonths + ' months', desc: 'Same term as today at an illustrative ' + pct(renew) + ' APY.', rate: renew },
      { id: 'ladder', dest: 'cd', name: 'Build a 3-rung CD ladder', desc: 'Split into 6, 12 and 18 month CDs so part of your money matures every 6 months. Blended ' + pct(ladder) + ' APY.', rate: ladder },
      { id: 'flex', dest: 'cd', name: 'Flexible CD', desc: 'Illustrative no-penalty CD at ' + pct(r.noPenalty) + ' APY. Access after an initial period without a penalty.', rate: r.noPenalty },
      { id: 'savings', dest: 'internal', name: 'Keep it all in savings', desc: 'Fully accessible at a variable, illustrative ' + pct(r.savings) + ' APY.', rate: r.savings },
      { id: 'out', dest: 'out', name: 'Move it out of KeyBank', desc: 'Your choice. MyKey shows what you would give up first.', rate: 0 }
    ].map(o => Object.assign(o, { interest: rest * o.rate / 100 }));
  }
  const penalty = (amount, apy) => amount * (apy / 100) * (db.rates.penaltyDays / 365);

  function mece() {
    const out = { cd: 0, internal: 0, out: 0, open: 0 };
    db.profiles.forEach(p => {
      if (!p.plan) { out.open += p.cd.amount; return; }
      const rest = p.cd.amount - p.plan.reserve;
      out.internal += p.plan.reserve;
      out[p.plan.dest] += rest;
    });
    return out;
  }

  /* ---------- assistant ---------- */
  const INTENTS = [
    ['scam', /password|\bpin\b|scam|fraud|social security|ssn|verify my account/i],
    ['banker', /banker|human|person|agent|call me|appointment|talk to|speak/i],
    ['early', /early|penalt|break|before matur|need it soon/i],
    ['ladder', /ladder|rung/i],
    ['rates', /rate|apy|interest|\bfed\b|yield/i],
    ['renew', /renew|roll ?over|automatic|grace/i],
    ['why', /why|data|privacy|track|personal|how do you know/i],
    ['maturity', /when.*matur|matur.*(date|day)|maturity/i],
    ['balance', /balance|how much do i have|my accounts/i],
    ['goal', /saving for|my goal|repair|emergency|tuition|\bcar\b|wedding|travel|medical|income/i],
    ['split', /split|accessible|reserve|keep|how much|plan|checkup|explain/i]
  ];
  const GOALS = [[/repair/i, 'Home repairs'], [/emergency/i, 'Emergency savings'], [/tuition|school|college/i, 'Tuition'], [/\bcar\b/i, 'Car replacement'], [/wedding/i, 'Wedding'], [/travel|trip/i, 'Travel'], [/medical/i, 'Medical costs'], [/income|retire/i, 'Monthly retirement income']];
  const CHIPS = [['split', 'Explain my split'], ['early', 'What if I need it early?'], ['rates', 'What if rates change?'], ['renew', 'What happens at maturity?'], ['why', 'Why am I seeing this?'], ['banker', 'Talk to a banker']];
  const intentOf = text => (INTENTS.find(([, re]) => re.test(text)) || ['fallback'])[0];

  function answer(intent, p, text) {
    const w = work(p), rest = p.cd.amount - w.reserve, detailed = p.prefs.detail === 'detailed', r = db.rates;
    if (db.content[intent]) return { text: db.content[intent], approved: true };
    const A = {
      split: () => 'Your Checkup keeps ' + m(w.reserve) + ' accessible for the next ' + w.months + ' months and puts ' + m(rest) + ' toward a term product. Only money you do not expect to need goes into a CD.' +
        (detailed ? ' At the illustrative rates in this demo, the reserve earns about ' + m(w.reserve * r.savings / 100) + ' a year in savings.' : ''),
      early: () => 'An early CD withdrawal may carry a penalty. See your CD terms for details.' +
        (detailed ? ' In this demo the illustrative penalty is ' + r.penaltyDays + ' days of interest.' : ''),
      rates: () => 'A fixed-rate CD keeps its rate until maturity, even if market rates move. Savings rates are variable and can change anytime. If you think rates may fall, locking part of your money in a CD protects that rate; money you might need should stay accessible.' +
        (detailed ? ' Illustrative demo rates: savings ' + pct(r.savings) + ', 6 months ' + pct(r.cd6) + ', 12 months ' + pct(r.cd12) + ', 18 months ' + pct(r.cd18) + '.' : ''),
      renew: () => 'Your CD ending ' + p.cd.number + ' matures on ' + matDate(p) + '. Many CDs renew automatically for a similar term at the rate offered at that time, and some include a short grace period. Your CD terms describe exactly what happens. The Checkup lets you decide before then.',
      ladder: () => 'A ladder splits your money across several terms so part of it matures every few months. With ' + m(rest) + ', a 3-rung ladder would place about ' + m(rest / 3) + ' each in 6, 12 and 18 month CDs.' +
        (detailed ? ' You give up a little rate on the shorter rungs in exchange for regular access points.' : ''),
      banker: () => 'I can connect you with a banker who will see your Checkup plan and your question, so you will not need to repeat yourself.',
      why: () => (p.prefs.insights
        ? 'You are seeing this because your CD matures within ' + db.rules.windowDays + ' days. I use your balances, CD terms and the goal you shared to build the Checkup. With personalized outreach on, recent account activity can affect whether a banker reaches out first, and a banker will ask rather than assume why you moved money.'
        : 'Activity insights are off, so I only use your CD balance, maturity date and the goal you shared.') + ' You control this in Privacy & Preferences.',
      maturity: () => 'Your ' + m(p.cd.amount) + ' CD ending ' + p.cd.number + ' matures on ' + matDate(p) + ', ' + p.cd.maturesInDays + ' days from today.',
      balance: () => 'Checking ' + m(p.checking) + ', savings ' + m(p.savings) + ', and your CD ' + m(p.cd.amount) + ' (matures ' + matDate(p) + ').',
      goal: () => {
        const g = GOALS.find(([re]) => re.test(text || ''));
        if (g) { p.goal = g[1]; }
        if (!p.goalConfirmed) { p.goalConfirmed = true; log(p.name, 'Confirmed savings goal in MyKey: ' + p.goal); }
        return 'Got it. I noted your goal as "' + p.goal + '". A banker will only see a goal you confirmed yourself. Want me to size your accessible reserve around it?';
      },
      scam: () => 'I will never ask for your password, PIN, or full Social Security number in chat. If someone contacts you claiming to be the bank and asks for those, stop and call the number on the back of your card.',
      fallback: () => 'I can help with your CD maturity plan, rates, early withdrawals, ladders, or connecting you to a banker. Try one of the suggestions below.'
    };
    return { text: (A[intent] || A.fallback)() };
  }
  function ask(p, text, intent) {
    intent = intent || intentOf(text);
    p.chat.push({ who: 'me', text });
    const a = answer(intent, p, text);
    p.chat.push({ who: 'bot', text: a.text, intent, approved: !!a.approved, id: uid('m'), banker: intent === 'banker' });
    save();
  }
  function ensureGreeting(p) {
    if (p.chat.length) return;
    p.chat.push({ who: 'bot', id: uid('m'), intent: 'hello', text: 'Hi ' + first(p) + ', I am MyKey. Your ' + m(p.cd.amount) + ' CD matures on ' + matDate(p) + '. I can help you decide how much to keep accessible and what to do with the rest.' });
  }

  /* ---------- shared chrome ---------- */
  function topbar() {
    const right = db.admin
      ? '<button data-act="go" data-to="admin/overview">Banker console</button>'
      : '<button data-act="drawer" data-d="admin">Banker console</button>';
    return '<div class="topbar"><div class="wrap"><span class="proto"><b>PROTOTYPE</b> Student case competition demo. Fictional data. Not operated by or affiliated with KeyBank.</span><span>' + right + '</span></div></div>';
  }
  function masthead(section) {
    return '<header class="masthead"><div class="wrap">' +
      '<button class="logo" data-act="go" data-to="home" aria-label="Prototype home"><span class="word">KeyBank ' + keySvg + '</span><span class="divider"></span><span class="section">' + section + '</span></button>' +
      '<div class="mast-right"><a class="btn-outline" href="https://www.key.com/personal/index.html" target="_blank" rel="noopener">Open an Account ↗</a>' +
      '<a href="https://www.key.com/personal/index.html" target="_blank" rel="noopener">Locations</a><a href="https://www.key.com/personal/index.html" target="_blank" rel="noopener">Contact Us</a>' +
      '<label class="search"><span class="sr">Search</span><input placeholder="I am looking for..." data-act="noop"><span aria-hidden="true">⌕</span></label></div></div></header>';
  }
  function footer() {
    return '<footer class="site"><div class="wrap"><div class="fcols">' +
      '<div><h4>Banking</h4><ul><li>Checking Accounts</li><li>Savings Accounts</li><li>Certificates of Deposit</li><li>Credit Cards</li></ul></div>' +
      '<div><h4>MyKey Lab</h4><ul><li><button class="linkbtn" data-act="drawer" data-d="signon">Savings Checkup</button></li><li><button class="linkbtn" data-act="drawer" data-d="admin">Banker console</button></li><li><button class="linkbtn" data-act="reset">Reset demo data</button></li></ul></div>' +
      '<div><h4>Official information</h4><ul><li><a href="https://www.key.com/personal/index.html" target="_blank" rel="noopener">KeyBank Personal Banking ↗</a></li><li><a href="https://www.key.com/personal/cd/certificate-of-deposit.html" target="_blank" rel="noopener">KeyBank CDs ↗</a></li></ul></div>' +
      '<div><h4>About this demo</h4><ul><li>Built for the KeyBank Symposium case competition, 2026.</li><li>Scripted assistant, no real accounts.</li></ul></div>' +
      '</div><div class="legal">Independent student prototype. This is not a KeyBank website and is not endorsed by KeyBank or KeyCorp. All customers, balances and transactions are fictional and stay in your browser. Rates and penalties are illustrative placeholders, not offers. For real products, rates and terms, visit key.com.</div></div></footer>';
  }

  /* ---------- public home ---------- */
  const icons = {
    check: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="10" width="32" height="20"/><path d="M9 22h10M9 17h6"/></svg>',
    save: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M8 20a12 9 0 0 1 24 0v6H8z"/><path d="M14 31v3M26 31v3M20 8v4"/></svg>',
    cd: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="20" cy="20" r="14"/><path d="M20 11v9l6 4"/></svg>',
    home: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 19 20 7l14 12M10 16v17h20V16"/></svg>',
    card: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="9" width="32" height="22" rx="2"/><path d="M4 16h32"/></svg>',
    loan: '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M8 32V14l12-6 12 6v18M14 32V20M20 32V20M26 32V20"/></svg>'
  };
  const heroArt = '<svg class="art" viewBox="0 0 420 360" aria-hidden="true"><rect x="120" y="20" width="190" height="320" rx="26" fill="#111" stroke="#555" stroke-width="3"/><rect x="134" y="44" width="162" height="272" rx="8" fill="#fff"/>' +
    '<rect x="134" y="44" width="162" height="34" fill="#1e1e1e"/><text x="146" y="66" fill="#fff" font-size="13" font-weight="700" font-family="Helvetica,Arial">MyKey</text>' +
    '<rect x="146" y="90" width="120" height="40" rx="4" fill="#f1f1f1"/><rect x="154" y="100" width="96" height="6" fill="#bbb"/><rect x="154" y="112" width="70" height="6" fill="#bbb"/>' +
    '<rect x="186" y="140" width="98" height="30" rx="4" fill="#b30000"/><rect x="196" y="150" width="70" height="6" fill="#fff" opacity=".8"/>' +
    '<text x="146" y="196" fill="#222" font-size="11" font-weight="700" font-family="Helvetica,Arial">Your split</text><rect x="146" y="204" width="138" height="12" fill="#ddd"/><rect x="146" y="204" width="48" height="12" fill="#cc0000"/>' +
    '<text x="146" y="236" fill="#cc0000" font-size="18" font-weight="800" font-family="Helvetica,Arial">$3,000</text><text x="222" y="236" fill="#444" font-size="18" font-weight="800" font-family="Helvetica,Arial">$7,000</text>' +
    '<text x="146" y="250" fill="#666" font-size="9" font-family="Helvetica,Arial">accessible</text><text x="222" y="250" fill="#666" font-size="9" font-family="Helvetica,Arial">to a CD</text>' +
    '<rect x="146" y="266" width="138" height="30" fill="#b30000"/><text x="171" y="285" fill="#fff" font-size="11" font-weight="700" font-family="Helvetica,Arial">Lock in my plan</text>' +
    '<circle cx="60" cy="90" r="34" fill="#cc0000" opacity=".9"/><text x="44" y="97" fill="#fff" font-size="20" font-weight="800" font-family="Helvetica,Arial">14d</text>' +
    '<rect x="330" y="230" width="78" height="54" rx="6" fill="#fff" opacity=".95"/><text x="340" y="252" fill="#222" font-size="10" font-weight="700" font-family="Helvetica,Arial">Banker</text><text x="340" y="268" fill="#666" font-size="9" font-family="Helvetica,Arial">handoff ready</text></svg>';

  function renderHome() {
    const nav = [['Banking', 'products'], ['Services', 'checkup'], ['Online Banking', 'how'], ['Financial Wellness', 'tips'], ['Customer Support', 'control']];
    const signed = me();
    return topbar() + masthead('Personal') +
      '<nav class="mainnav" aria-label="Main"><div class="wrap"><ul>' + nav.map(([l, t]) => '<li><button data-act="scroll" data-to="' + t + '">' + l + '</button></li>').join('') + '</ul>' +
      (signed ? '<button class="signon-btn" data-act="go" data-to="app/accounts">Go to MyKey</button>' : '<button class="signon-btn" data-act="drawer" data-d="signon">Sign On</button>') + '</div></nav>' +
      '<main id="main">' +
      '<section class="hero"><div class="wrap">' + heroArt + '<div class="kicker">New in MyKey</div><h1>your CD is maturing. let\'s plan what\'s next.</h1><p>The MyKey Savings Checkup helps you decide how much to keep accessible, what to do with the rest, and when to bring in a banker.</p>' +
      '<button class="btn" data-act="drawer" data-d="signon">Start your Checkup</button> <button class="btn ghost" style="background:transparent;color:#fff;border-color:#fff" data-act="scroll" data-to="how">See how it works</button></div></section>' +
      '<div class="quick"><button data-act="drawer" data-d="signon">Sign On to MyKey</button><button data-act="scroll" data-to="checkup">Compare CD choices</button><button data-act="drawer" data-d="signon">Talk to a banker</button></div>' +
      '<section class="band" id="products"><div class="wrap"><h2 class="h-lower">for every financial need, we\'ll meet you in the moment.</h2><p class="lead">Get started with personal banking products and services.</p><div class="products">' +
      [['check', 'Checking'], ['save', 'Savings'], ['cd', 'CDs'], ['home', 'Mortgages'], ['card', 'Credit Cards'], ['loan', 'Personal Loans']].map(([i, l]) =>
        '<button data-act="' + (i === 'cd' ? 'drawer' : 'external') + '" data-d="signon">' + icons[i] + l + '</button>').join('') + '</div></div></section>' +
      '<section class="band grey" id="checkup"><div class="wrap"><div class="kicker">MyKey Savings Checkup</div><h2 class="h-lower">a smarter moment at maturity.</h2><p class="lead">A customer can keep banking with us and still move savings elsewhere. The Checkup meets you right before your CD matures, when that decision happens.</p><div class="cards">' +
      '<div class="card"><div class="kicker">Plan</div><h3>Split by when you need it</h3><p>Set aside what you may need soon, then compare what to do with the rest: renew, ladder, a flexible CD, or savings.</p></div>' +
      '<div class="card"><div class="kicker">Ask</div><h3>Plain-language answers</h3><p>Ask MyKey about penalties, rates or renewal. Flag any answer that is unclear and a reviewer improves it.</p></div>' +
      '<div class="card"><div class="kicker">Connect</div><h3>A banker who has context</h3><p>Hand off to a banker with your plan and question attached, so you never start over.</p></div></div></div></section>' +
      '<section class="band" id="how"><div class="wrap"><h2 class="h-lower">how it works.</h2><div class="steps">' +
      '<div><h3>MyKey checks in</h3><p class="muted">Before maturity, on the reminder schedule you pick: 30, 14 or 7 days out.</p></div>' +
      '<div><h3>You set your split</h3><p class="muted">Choose how much stays accessible and stress-test it against a surprise expense.</p></div>' +
      '<div><h3>Lock in or talk it through</h3><p class="muted">Save your plan in a tap, or request a banker who sees exactly what you chose.</p></div></div></div></section>' +
      '<section class="band grey" id="control"><div class="wrap"><h2 class="h-lower">you\'re in control.</h2><div class="cards">' +
      '<div class="card"><h3>Opt in or out anytime</h3><p>Personalized outreach and activity insights are separate switches you control.</p></div>' +
      '<div class="card"><h3>See why you\'re seeing it</h3><p>Ask MyKey "why am I seeing this?" for a clear explanation of the data it used.</p></div>' +
      '<div class="card"><h3>No passwords in chat</h3><p>MyKey in this prototype never asks for a password, PIN or full Social Security number.</p></div></div></div></section>' +
      '<section class="band" id="tips"><div class="wrap"><h2 class="h-lower">tips and how-to\'s.</h2><div class="tips">' +
      [['', 'SAVINGS', 'What happens when a CD matures'], ['b', 'SAVINGS', 'CD ladders, explained'], ['c', 'PLANNING', 'How big should your accessible reserve be?'], ['d', 'FRAUD', 'How to recognize bank imposter scams']].map(([c, k, t]) =>
        '<div class="tip"><div class="img ' + c + '"></div><div class="t"><small>' + k + '</small><h4>' + t + '</h4></div></div>').join('') + '</div></div></section>' +
      '</main>' + footer();
  }

  /* ---------- drawers ---------- */
  function renderDrawer() {
    if (!ui.drawer) return '';
    let body = '';
    if (ui.drawer === 'signon') {
      body = '<h2>Sign On</h2><p class="note">Demo sign-on. This prototype never asks for a password.</p>' +
        '<form data-form="signon"><label class="f" for="uid">User ID</label><input class="t" id="uid" name="uid" list="uids" autocomplete="off" placeholder="e.g. michael.demo" value="' + esc(ui.prefill) + '">' +
        '<datalist id="uids">' + db.profiles.map(p => '<option value="' + esc(p.userId) + '">').join('') + '</datalist>' +
        '<button class="btn" style="width:100%;margin-top:14px">Sign On</button></form>' +
        '<h3 style="margin:24px 0 4px">Demo profiles</h3><p class="note">Pick anyone to see their personalized Checkup.</p><div class="demo-list">' +
        db.profiles.map(p => '<button data-act="signin" data-id="' + p.id + '"><span><b>' + esc(p.name) + '</b><small>' + esc(p.segment) + ' · ' + m(p.cd.amount) + ' CD in ' + p.cd.maturesInDays + ' days</small></span><span aria-hidden="true">›</span></button>').join('') + '</div>' +
        '<button class="linkbtn" data-act="drawer" data-d="enroll">Enroll a new demo profile</button>';
    } else if (ui.drawer === 'enroll') {
      body = '<h2>Enroll</h2><p class="note">Create a fictional profile. It is saved in this browser and appears in the banker console.</p>' +
        '<form data-form="enroll">' +
        fld('Full name', 'name', '', 'text', 'required') + fld('User ID', 'userId', ui.prefill, 'text', 'required') +
        fld('Savings goal', 'goal', 'Emergency savings') + fld('Goal amount ($)', 'goalAmount', 4000, 'number', 'min="0" step="100"') +
        fld('CD balance ($)', 'cdAmount', 10000, 'number', 'min="500" step="100"') + fld('CD matures in (days)', 'days', 14, 'number', 'min="0" max="365"') +
        '<label class="f" for="f-needMonths">When might you need the goal money?</label><select class="t" id="f-needMonths" name="needMonths"><option value="3">Within 3 months</option><option value="6" selected>In 6 months</option><option value="12">In 12 months</option></select>' +
        '<label style="display:flex;gap:8px;margin-top:14px;font-size:14px"><input type="checkbox" name="personalized" checked> Allow personalized MyKey outreach</label>' +
        '<button class="btn" style="width:100%;margin-top:16px">Create profile and sign on</button></form>' +
        '<p><button class="linkbtn" data-act="drawer" data-d="signon">Back to sign on</button></p>';
    } else if (ui.drawer === 'admin') {
      body = '<h2>Banker console</h2><p class="note">Demo role for the retention team: prioritize outreach, manage profiles, review MyKey answers and model pilot economics.</p>' +
        '<div class="notice">No password in this prototype. In production this would sit behind employee single sign-on with role-based access.</div>' +
        '<button class="btn" style="width:100%" data-act="enterAdmin">Enter banker console</button>';
    }
    return '<div class="scrim" data-act="closeDrawer"></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="' + ui.drawer + '"><button class="close" data-act="closeDrawer" aria-label="Close">×</button>' + body + '</aside>';
  }
  function fld(label, name, value, type, extra) {
    return '<label class="f" for="f-' + name + '">' + label + '</label><input class="t" id="f-' + name + '" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(value) + '" ' + (extra || '') + '>';
  }

  /* ---------- customer app ---------- */
  function renderApp() {
    const p = me();
    const unread = p.inbox.filter(x => !x.read).length;
    const tabs = [['accounts', 'Accounts'], ['checkup', 'Savings Checkup'], ['messages', 'Messages' + (unread ? '<span class="badge">' + unread + '</span>' : '')], ['privacy', 'Privacy & Preferences']];
    let page = '';
    if (ui.sub === 'checkup') page = pageCheckup(p);
    else if (ui.sub === 'messages') page = pageMessages(p);
    else if (ui.sub === 'privacy') page = pagePrivacy(p);
    else page = pageAccounts(p);
    return topbar() + masthead('Online Banking') +
      '<nav class="mainnav" aria-label="Signed in"><div class="wrap"><ul class="appbar" style="border:0">' +
      tabs.map(([k, l]) => '<li><button class="' + (ui.sub === k ? 'on' : '') + '" data-act="go" data-to="app/' + k + '">' + l + '</button></li>').join('') +
      '</ul><button class="signon-btn out" data-act="signout">Sign Off</button></div></nav>' +
      '<main class="app" id="main"><div class="wrap">' + page + '</div></main>' + footer();
  }

  function pageAccounts(p) {
    const tx = p.prefs.insights ? recentTransfers(p) : [];
    const activity = [
      { d: 1, desc: 'Payroll deposit', amt: 2150 },
      { d: 4, desc: 'Card purchase: grocery', amt: -86.4 }
    ].concat(tx.map(t => ({ d: t.daysAgo, desc: 'Transfer to ' + t.to, amt: -t.amount }))).sort((a, b) => a.d - b.d);
    const hour = new Date().getHours();
    return '<div class="greet"><div><h1>good ' + (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening') + ', ' + esc(first(p).toLowerCase()) + '.</h1><span class="muted">Demo profile: ' + esc(p.segment) + '</span></div><span class="muted">Today ' + fmtDate(Date.now()) + '</span></div>' +
      '<div class="alert"><div><div class="kicker">MyKey Savings Checkup</div><h2>Your ' + m(p.cd.amount) + ' CD matures in ' + p.cd.maturesInDays + ' days</h2><p>' + (p.plan ? 'Plan saved ' + fmtDate(p.plan.at) + ': ' + m(p.plan.reserve) + ' accessible, ' + esc(p.plan.label) + ' for the rest.' : 'Decide how much to keep accessible before ' + matDate(p) + '.') + '</p></div>' +
      '<button class="btn" data-act="go" data-to="app/checkup">' + (p.plan ? 'Review my plan' : 'Start your Checkup') + '</button></div>' +
      '<div class="grid2"><div class="panel"><h2>Accounts</h2><div class="table-wrap"><table><thead><tr><th>Account</th><th>Details</th><th class="num">Balance</th></tr></thead><tbody>' +
      '<tr><th>Key Smart Checking</th><td class="muted">••' + p.cd.number.slice(0, 2) + '19</td><td class="num">' + m2(p.checking) + '</td></tr>' +
      '<tr><th>Key Savings</th><td class="muted">Variable rate</td><td class="num">' + m2(p.savings) + '</td></tr>' +
      '<tr><th>Certificate of Deposit</th><td class="muted">••' + p.cd.number + ' · ' + p.cd.termMonths + ' months at ' + pct(p.cd.apy) + ' · matures ' + matDate(p) + '</td><td class="num">' + m2(p.cd.amount) + '</td></tr>' +
      '</tbody><tfoot><tr><th colspan="2">Total</th><th class="num">' + m2(p.checking + p.savings + p.cd.amount) + '</th></tr></tfoot></table></div></div>' +
      '<div class="panel"><h2>Recent activity</h2>' + (p.prefs.insights ? '' : '<p class="note">Activity insights are off. MyKey does not use this list.</p>') +
      '<table><tbody>' + activity.map(a => '<tr><td class="muted">' + fmtDate(Date.now() - a.d * DAY) + '</td><td>' + esc(a.desc) + '</td><td class="num">' + (a.amt < 0 ? '-' : '+') + m2(Math.abs(a.amt)) + '</td></tr>').join('') + '</tbody></table>' +
      '<details style="margin-top:12px"><summary class="linkbtn" style="cursor:pointer">Why am I seeing the Checkup?</summary><p class="note">' + esc(answer('why', p).text) + '</p></details></div></div>';
  }

  function pageCheckup(p) {
    const w = work(p);
    const chosen = options(p).find(o => o.id === w.choice) || options(p)[0];
    return '<div class="greet"><div><div class="kicker">MyKey Savings Checkup</div><h1>what\'s next for your ' + m(p.cd.amount) + '?</h1><span class="muted">CD ••' + p.cd.number + ' matures ' + matDate(p) + '. Goal: ' + esc(p.goal) + (p.goalConfirmed ? ' (confirmed by you)' : ' (tell MyKey if this changed)') + '</span></div>' +
      '<button class="btn ghost" data-act="openChat">Ask MyKey</button></div>' +
      '<div class="grid2"><div class="stack">' +
      '<div class="panel"><h2><span class="stepno">1</span>Keep what you need accessible</h2>' +
      '<label class="f" for="ck-months">When might you need it?</label><select class="t" id="ck-months" data-ck="months"><option value="3"' + (w.months == 3 ? ' selected' : '') + '>Within 3 months</option><option value="6"' + (w.months == 6 ? ' selected' : '') + '>In 6 months</option><option value="12"' + (w.months == 12 ? ' selected' : '') + '>In 12 months</option></select>' +
      '<label class="f" for="ck-reserve">How much would you keep accessible?</label><input id="ck-reserve" type="range" min="0" max="' + p.cd.amount + '" step="250" value="' + w.reserve + '" data-live="reserve">' +
      '<div class="rangelbl"><span>$0</span><span>Your goal: ' + m(p.goalAmount) + '</span><span>' + m(p.cd.amount) + '</span></div>' +
      '<div id="ck-figs">' + ckFigs(p) + '</div></div>' +
      '<div class="panel"><h2><span class="stepno">2</span>Choose what to do with the rest</h2><p class="note">Estimated interest over 12 months. Rates are illustrative demo values, not KeyBank offers. Verify in official terms.</p><div id="ck-opts">' + ckOpts(p) + '</div></div>' +
      '<div class="panel"><h2><span class="stepno">3</span>Stress-test your plan</h2><label class="f" for="ck-expense">Surprise expense</label><input id="ck-expense" type="range" min="0" max="' + p.cd.amount + '" step="250" value="' + Math.min(w.expense, p.cd.amount) + '" data-live="expense"><div id="ck-stress">' + ckStress(p) + '</div></div>' +
      '</div><div class="stack">' +
      '<div class="panel" id="ck-summary">' + ckSummary(p, chosen) + '</div>' +
      '<div class="panel"><h2>Talk it through with a banker</h2><p class="muted">Your plan and recent MyKey questions go with the request, so the banker starts with context.</p>' +
      '<label class="f" for="ck-method">How</label><select class="t" id="ck-method"><option>Phone call</option><option>Video meeting</option><option>Branch visit</option></select>' +
      '<label class="f" for="ck-slot">When</label><select class="t" id="ck-slot"><option>Next available</option><option>Tomorrow morning</option><option>Tomorrow afternoon</option><option>This weekend</option></select>' +
      '<button class="btn dark" style="margin-top:14px" data-act="requestBanker">Request a banker</button>' +
      (db.appointments.filter(a => a.profileId === p.id).map(a => '<p class="note">Request ' + esc(a.status) + ': ' + esc(a.method) + ', ' + esc(a.slot) + ' (' + fmtTime(a.at) + ')</p>').join('')) + '</div>' +
      '<div class="panel"><h3>Learn more</h3><p class="note">Official product details, rates and early-withdrawal terms are on key.com.</p><a href="https://www.key.com/personal/cd/certificate-of-deposit.html" target="_blank" rel="noopener">View official KeyBank CD information ↗</a></div>' +
      '</div></div>';
  }
  function ckFigs(p) {
    const w = work(p), rest = p.cd.amount - w.reserve, share = p.cd.amount ? w.reserve / p.cd.amount * 100 : 0;
    const goalNote = w.reserve >= p.goalAmount ? 'Covers your ' + m(p.goalAmount) + ' goal.' : 'That is ' + m(p.goalAmount - w.reserve) + ' short of your ' + m(p.goalAmount) + ' goal.';
    const horizon = w.months <= 3 ? 'For money you need within 3 months, accessible savings avoids any penalty risk.' : w.months <= 6 ? 'With a 6-month horizon, keep the reserve accessible or use a term that ends before then.' : 'With a 12-month horizon, a short CD or ladder rung that ends before then can also work.';
    return '<div class="figs" aria-live="polite"><div><strong>' + m(w.reserve) + '</strong>Keep accessible</div><div class="alt"><strong>' + m(rest) + '</strong>Available for a term product</div></div>' +
      '<div class="bar" aria-hidden="true"><i style="width:' + share + '%"></i><i class="b" style="width:' + (100 - share) + '%"></i></div>' +
      '<p class="note" style="margin-top:10px">' + goalNote + ' ' + horizon + '</p>';
  }
  function ckOpts(p) {
    const w = work(p);
    return '<div class="opts" role="radiogroup" aria-label="Options for the rest">' + options(p).map(o =>
      '<label class="opt"><input type="radio" name="ck-choice" value="' + o.id + '"' + (w.choice === o.id ? ' checked' : '') + ' data-ck="choice"><span><b>' + o.name + '</b><small>' + o.desc + '</small></span><span class="val">' + (o.dest === 'out' ? '<span class="muted">Leaves KeyBank</span>' : '+' + m(o.interest) + '<br><small>per year</small>') + '</span></label>').join('') + '</div>';
  }
  function ckStress(p) {
    const w = work(p), exp = Math.min(w.expense, p.cd.amount);
    const short = Math.max(0, exp - w.reserve);
    const o = options(p).find(x => x.id === w.choice) || options(p)[0];
    let msg;
    if (!short) msg = '<span class="chip ok">Covered</span> Your ' + m(w.reserve) + ' reserve covers a ' + m(exp) + ' surprise with ' + m(w.reserve - exp) + ' to spare.';
    else if (o.id === 'savings' || o.id === 'flex') msg = '<span class="chip warn">Short ' + m(short) + '</span> Your reserve falls short, but the option you picked keeps the rest accessible' + (o.id === 'flex' ? ' after its initial period' : '') + '.';
    else if (o.id === 'out') msg = '<span class="chip warn">Short ' + m(short) + '</span> You would need to cover ' + m(short) + ' from money held outside KeyBank.';
    else msg = '<span class="chip red">Short ' + m(short) + '</span> Breaking a CD early to cover it could cost about ' + m2(penalty(short, o.rate)) + ' at the illustrative ' + db.rates.penaltyDays + '-day interest penalty. Consider raising your reserve.';
    return '<p style="margin:8px 0 0">' + msg + '</p>';
  }
  function ckSummary(p, o) {
    const w = work(p), rest = p.cd.amount - w.reserve, sav = w.reserve * db.rates.savings / 100;
    o = o || options(p).find(x => x.id === w.choice);
    return '<div class="kicker">Your plan</div><h2>' + m(w.reserve) + ' accessible, ' + m(rest) + ' to: ' + esc(o.name) + '</h2>' +
      '<table><tbody><tr><td>Accessible reserve (savings)</td><td class="num">' + m(w.reserve) + '</td></tr><tr><td>' + esc(o.name) + '</td><td class="num">' + m(rest) + '</td></tr>' +
      '<tr><th>Est. interest, 12 months</th><th class="num">' + m(sav + o.interest) + '</th></tr></tbody></table>' +
      (o.id === 'out' ? '<div class="notice">Moving ' + m(rest) + ' out gives up about ' + m(rest * rateFor(p.cd.termMonths) / 100) + ' a year at the illustrative renewal rate. That is your call, and a banker can help compare.</div>' : '') +
      '<button class="btn" style="width:100%;margin-top:14px" data-act="confirmPlan">' + (p.plan ? 'Update my plan' : 'Lock in my plan') + '</button>' +
      (p.plan ? '<p class="note">Saved ' + fmtTime(p.plan.at) + '. In a live product this would set your maturity instructions.</p>' : '<p class="note">Nothing moves until maturity. You can change this anytime before ' + matDate(p) + '.</p>');
  }

  function pageMessages(p) {
    const list = p.inbox.slice().sort((a, b) => b.at - a.at);
    return '<div class="greet"><h1>messages.</h1></div><div class="panel">' + (list.length ? list.map(x =>
      '<article class="msg ' + (x.read ? '' : 'unread') + '"><header><span>' + esc(x.from) + '</span><span>' + fmtTime(x.at) + '</span></header><h3 style="margin:6px 0">' + esc(x.subject) + '</h3><p style="margin:0 0 10px">' + esc(x.body) + '</p>' +
      (x.kind === 'outreach' ? (x.response ? '<span class="chip ok">You responded: ' + esc(x.response) + '</span>' :
        '<button class="btn small" data-act="msgReply" data-id="' + x.id + '" data-r="Opened Checkup">Open Savings Checkup</button> <button class="btn small ghost" data-act="msgReply" data-id="' + x.id + '" data-r="Requested a banker">Have a banker call me</button> <button class="btn small ghost" data-act="msgReply" data-id="' + x.id + '" data-r="Not interested">Not now</button>') : '') +
      (!x.read ? ' <button class="linkbtn" data-act="msgRead" data-id="' + x.id + '">Mark as read</button>' : '') + '</article>').join('')
      : '<p class="muted">No messages yet. When a banker sends Checkup outreach from the console, it appears here.</p>') + '</div>';
  }

  function pagePrivacy(p) {
    const pr = p.prefs;
    const sw = (key, title, desc) => '<div class="toggle"><div><b>' + title + '</b><p>' + desc + '</p></div><span class="switch"><input type="checkbox" id="pref-' + key + '" data-pref="' + key + '"' + (pr[key] ? ' checked' : '') + ' aria-label="' + title + '"><span></span></span></div>';
    return '<div class="greet"><h1>privacy & preferences.</h1></div><div class="grid2"><div class="panel"><h2>Personalization</h2>' +
      sw('personalized', 'Personalized MyKey outreach', 'Let a banker or MyKey reach out about your CD maturity with suggestions based on your goal.') +
      sw('insights', 'Use account activity for insights', 'Allow MyKey to consider recent account activity. When off, only your balances, CD terms and stated goal are used.') +
      '<h2 style="margin-top:22px">How to reach you</h2>' + sw('app', 'MyKey in-app message', 'Messages appear in your MyKey inbox.') + sw('email', 'Email', 'Send a copy by email.') + sw('sms', 'Text message', 'Short reminders only. No links to sign in.') +
      '<label class="f" for="pref-lead">Remind me before my CD matures</label><select class="t" id="pref-lead" data-prefsel="leadDays">' + [30, 14, 7].map(d => '<option value="' + d + '"' + (pr.leadDays == d ? ' selected' : '') + '>' + d + ' days before</option>').join('') + '</select>' +
      '<label class="f" for="pref-detail">How MyKey explains things</label><select class="t" id="pref-detail" data-prefsel="detail"><option value="plain"' + (pr.detail === 'plain' ? ' selected' : '') + '>Short and plain</option><option value="detailed"' + (pr.detail === 'detailed' ? ' selected' : '') + '>More detail with numbers</option></select>' +
      '</div><div class="stack"><div class="panel"><h2>Your savings goal</h2><p class="muted">Bankers only see a goal you confirmed.</p>' +
      '<form data-form="goal"><label class="f" for="g-goal">Goal</label><input class="t" id="g-goal" name="goal" value="' + esc(p.goal) + '"><label class="f" for="g-amt">Amount ($)</label><input class="t" id="g-amt" name="goalAmount" type="number" min="0" step="100" value="' + p.goalAmount + '">' +
      '<button class="btn" style="margin-top:12px">' + (p.goalConfirmed ? 'Update goal' : 'Confirm goal') + '</button></form></div>' +
      '<div class="panel"><h2>What MyKey knows about you</h2><p class="muted">A plain view of the data this demo stores.</p><pre class="json">' + esc(JSON.stringify({ name: p.name, goal: p.goal, goalConfirmed: p.goalConfirmed, cd: p.cd, preferences: p.prefs, savedPlan: p.plan, activityUsed: p.prefs.insights ? recentTransfers(p).length + ' recent transfers' : 'none' }, null, 2)) + '</pre>' +
      '<button class="btn small ghost" data-act="clearChat">Delete my MyKey chat history</button></div></div></div>';
  }

  /* ---------- chat dock ---------- */
  function renderChat() {
    const el = byId('chat');
    const p = me();
    if (ui.route !== 'app' || !p) { el.innerHTML = ''; return; }
    if (!ui.chatOpen) { el.innerHTML = '<div class="chatdock"><button class="chatfab" data-act="openChat">💬 Ask MyKey</button></div>'; return; }
    ensureGreeting(p);
    el.innerHTML = '<div class="chatdock"><section class="chatbox" aria-label="MyKey assistant"><div class="chathead"><div><b>MyKey</b><small>Simulated assistant · scripted demo responses</small></div><button data-act="closeChat" aria-label="Minimize">–</button></div>' +
      '<div class="chatlog" id="chatlog" aria-live="polite">' + p.chat.map(c => c.who === 'me' ? '<div class="bubble me">' + esc(c.text) + '</div>' :
        '<div class="bubble bot">' + esc(c.text) + (c.banker ? '<div style="margin-top:8px"><button class="btn small" data-act="requestBanker">Request a banker</button></div>' : '') +
        (c.intent && c.intent !== 'hello' ? '<div class="src">' + (c.approved ? 'Reviewed answer · ' : '') + 'Confirm details in your CD terms</div><div class="meta">' + (c.flagged ? '<span class="muted">Sent for review. Thanks.</span>' : c.rated ? '<span class="muted">Thanks for the feedback.</span>' : '<button data-act="rate" data-id="' + c.id + '">Helpful</button><button data-act="flag" data-id="' + c.id + '">Flag: unclear or wrong</button>') + '</div>' : '') + '</div>').join('') + '</div>' +
      '<div class="chatchips">' + CHIPS.map(([k, l]) => '<button data-act="chip" data-k="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<form class="chatform" data-form="chat"><label class="sr" for="chatin">Message MyKey</label><input id="chatin" name="q" autocomplete="off" placeholder="Ask about your CD, or tell me your goal"><button>Send</button></form></section></div>';
    const log = byId('chatlog'); log.scrollTop = log.scrollHeight;
  }

  /* ---------- admin console ---------- */
  function renderAdmin() {
    const tabs = [['overview', 'Overview'], ['queue', 'Retention queue'], ['profiles', 'Profiles'], ['content', 'Answer review'], ['appointments', 'Banker requests'], ['rules', 'Rules & rates'], ['pilot', 'Pilot economics'], ['audit', 'Audit log']];
    const pending = db.reviews.filter(r => r.status === 'pending').length, openAppts = db.appointments.filter(a => a.status !== 'Completed').length;
    const badge = k => k === 'content' && pending ? '<span class="chip red">' + pending + '</span>' : k === 'appointments' && openAppts ? '<span class="chip red">' + openAppts + '</span>' : '';
    const pages = { overview: admOverview, queue: admQueue, profiles: admProfiles, content: admContent, appointments: admAppts, rules: admRules, pilot: admPilot, audit: admAudit };
    return topbar() + '<div class="adminbar"><div class="wrap"><span class="ttl">KeyBank <span>Banker Console</span> · MyKey Savings Checkup</span><span><button data-act="go" data-to="home">Public site</button> <button data-act="drawer" data-d="signon">View as customer</button> <button data-act="exitAdmin">Exit console</button></span></div></div>' +
      '<main class="app" id="main"><div class="wrap adm"><nav class="side" aria-label="Console">' + tabs.map(([k, l]) => '<button class="' + (ui.sub === k ? 'on' : '') + '" data-act="go" data-to="admin/' + k + '">' + l + badge(k) + '</button>').join('') + '</nav><div>' + (pages[ui.sub] || admOverview)() + '</div></div></main>';
  }

  function admOverview() {
    const due = db.profiles.filter(p => p.cd.maturesInDays <= db.rules.windowDays);
    const flagged = db.profiles.filter(p => action(p).key === 'outreach');
    const consent = db.profiles.filter(p => p.prefs.personalized).length;
    const plans = db.profiles.filter(p => p.plan).length;
    const x = mece(), total = x.cd + x.internal + x.out + x.open || 1;
    const share = v => Math.round(v / total * 100) + '%';
    return '<div class="greet"><h1>retention overview.</h1><span class="muted">' + db.profiles.length + ' profiles · fictional data</span></div>' +
      '<div class="kpis"><div class="kpi"><strong>' + m(due.reduce((s, p) => s + p.cd.amount, 0)) + '</strong><span>CD dollars maturing in ' + db.rules.windowDays + ' days (' + due.length + ' CDs)</span></div>' +
      '<div class="kpi"><strong>' + flagged.length + '</strong><span>Flagged for personalized outreach</span></div>' +
      '<div class="kpi"><strong>' + Math.round(consent / Math.max(1, db.profiles.length) * 100) + '%</strong><span>Opted in to personalization</span></div>' +
      '<div class="kpi"><strong>' + plans + ' / ' + db.profiles.length + '</strong><span>Completed a Checkup plan</span></div></div>' +
      '<div class="panel"><div class="kicker">MECE view</div><h2>Where is each maturing CD dollar headed?</h2><p class="muted">Every dollar lands in exactly one bucket. Accessible reserves count as staying in another KeyBank account.</p>' +
      '<div class="bar" style="height:22px;margin-top:10px"><i style="width:' + share(x.cd) + '"></i><i style="width:' + share(x.internal) + ';background:#e06666"></i><i class="b" style="width:' + share(x.out) + '"></i></div>' +
      '<div class="mece"><div><span class="muted">Renews into a KeyBank CD</span><strong>' + m(x.cd) + '</strong>' + share(x.cd) + '</div><div><span class="muted">Moves to another KeyBank account</span><strong>' + m(x.internal) + '</strong>' + share(x.internal) + '</div><div><span class="muted">Leaves KeyBank</span><strong>' + m(x.out) + '</strong>' + share(x.out) + '</div><div><span class="muted">No decision yet</span><strong>' + m(x.open) + '</strong>' + share(x.open) + '</div></div></div>' +
      '<div class="grid2" style="margin-top:20px"><div class="panel"><h2>Next best contacts</h2><table><tbody>' + db.profiles.slice().sort((a, b) => score(b).score - score(a).score).slice(0, 4).map(p => { const a = action(p); return '<tr><th>' + esc(p.name) + '</th><td>' + scoreBar(score(p).score) + '</td><td><span class="chip ' + a.cls + '">' + a.label + '</span></td></tr>'; }).join('') + '</tbody></table><button class="btn small" data-act="go" data-to="admin/queue" style="margin-top:12px">Open retention queue</button></div>' +
      '<div class="panel"><h2>Recent activity</h2>' + (db.audit.length ? '<table><tbody>' + db.audit.slice(0, 6).map(a => '<tr><td class="muted">' + fmtTime(a.at) + '</td><td><b>' + esc(a.who) + '</b> ' + esc(a.what) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">No activity yet. Sign in as a customer and try the Checkup.</p>') + '</div></div>';
  }
  const scoreBar = s => '<span class="score"><i><b style="width:' + s + '%"></b></i>' + s + '</span>';

  function admQueue() {
    const list = db.profiles.slice().sort((a, b) => score(b).score - score(a).score);
    if (!ui.sel || !prof(ui.sel)) ui.sel = list[0] && list[0].id;
    const p = prof(ui.sel);
    return '<div class="greet"><h1>retention queue.</h1><span class="muted">Review at ' + db.rules.threshold + '+ with consent</span></div>' +
      '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Customer</th><th>CD</th><th>Signals</th><th>Priority</th><th>Next step</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(x => { const s = score(x), a = action(x); return '<tr class="' + (x.id === ui.sel ? 'sel' : '') + '"><th>' + esc(x.name) + '<br><small class="muted">' + esc(x.segment) + '</small></th><td>' + m(x.cd.amount) + '<br><small class="muted">in ' + x.cd.maturesInDays + ' days</small></td><td>' + (s.reasons.map(r => '<span class="chip">' + esc(r[0]) + '</span>').join('') || '<span class="muted">None</span>') + '</td><td>' + scoreBar(s.score) + '</td><td><span class="chip ' + a.cls + '">' + a.label + '</span></td><td>' + status(x) + '</td><td><button class="btn small ghost" data-act="sel" data-id="' + x.id + '">Review</button></td></tr>'; }).join('') +
      '</tbody></table></div><p class="note">Illustrative rules, editable under Rules & rates. In a pilot, validate the score against historical outcomes and compare error rates across eligible customer groups. Signals start a conversation; the customer confirms the reason.</p></div>' +
      (p ? queueDetail(p) : '');
  }
  function status(p) {
    const sent = p.inbox.find(x => x.kind === 'outreach');
    if (p.plan) return '<span class="chip ok">Plan: ' + esc(p.plan.label) + '</span>';
    if (sent && sent.response) return '<span class="chip">' + esc(sent.response) + '</span>';
    if (sent) return '<span class="chip">Outreach sent</span>';
    return '<span class="muted">Not contacted</span>';
  }
  function draftFor(p) {
    const a = action(p);
    if (a.key === 'paused') return 'Hi ' + first(p) + ', your CD ending ' + p.cd.number + ' matures on ' + matDate(p) + '. Visit MyKey or key.com to review your options.';
    if (a.key === 'standard') return 'Hi ' + first(p) + ', this is a reminder that your CD ending ' + p.cd.number + ' matures on ' + matDate(p) + '. You can review your maturity options in MyKey.';
    if (p.goalConfirmed) return 'Hi ' + first(p) + ', your CD ending ' + p.cd.number + ' matures on ' + matDate(p) + '. You mentioned ' + p.goal.toLowerCase() + '. Want to see how much you could keep accessible and what to do with the rest? Your Savings Checkup is ready in MyKey, or I can set up a call.';
    return 'Hi ' + first(p) + ', your CD ending ' + p.cd.number + ' matures on ' + matDate(p) + '. Would you like to compare options based on when you might need the money? Your Savings Checkup is ready in MyKey.';
  }
  function queueDetail(p) {
    const s = score(p), a = action(p), plan = p.plan;
    const sent = p.inbox.filter(x => x.kind === 'outreach' || x.kind === 'notice-std');
    return '<div class="grid2" style="margin-top:20px"><div class="panel"><div class="kicker">Customer review</div><h2>' + esc(p.name) + '</h2>' +
      '<p class="muted">' + esc(p.segment) + ' · customer ' + p.tenureYears + ' years · ' + m(p.cd.amount) + ' CD at ' + pct(p.cd.apy) + ', matures ' + matDate(p) + '</p>' +
      '<h3>Score breakdown</h3><table><tbody>' + (s.reasons.map(r => '<tr><td>' + esc(r[0]) + '</td><td class="num">+' + r[1] + '</td></tr>').join('') || '<tr><td class="muted">No signals</td><td class="num">0</td></tr>') + '<tr><th>Priority (capped at 100)</th><th class="num">' + s.score + '</th></tr></tbody></table>' +
      '<h3 style="margin-top:16px">Consent and goal</h3><p>' + (p.prefs.personalized ? '<span class="chip ok">Personalized outreach on</span>' : '<span class="chip warn">Personalized outreach off</span>') + (p.prefs.insights ? '<span class="chip ok">Activity insights on</span>' : '<span class="chip warn">Activity insights off</span>') +
      (p.goalConfirmed ? '<span class="chip ok">Goal confirmed: ' + esc(p.goal) + '</span>' : '<span class="chip">Goal not confirmed yet</span>') + '</p>' +
      (plan ? '<div class="notice">Checkup plan: ' + m(plan.reserve) + ' accessible, ' + m(p.cd.amount - plan.reserve) + ' to ' + esc(plan.label) + '.</div>' : '') +
      '<label class="f" for="q-notes">Banker notes</label><textarea class="t" id="q-notes" rows="3" data-notes="' + p.id + '">' + esc(p.notes) + '</textarea>' +
      '<p style="margin-top:12px"><button class="btn small ghost" data-act="confirmGoal" data-id="' + p.id + '"' + (p.goalConfirmed ? ' disabled' : '') + '>Record customer\'s stated goal</button> <button class="btn small ghost" data-act="impersonate" data-id="' + p.id + '">Preview as customer</button></p></div>' +
      '<div class="panel"><div class="kicker">Outreach</div><h2>' + (a.key === 'outreach' ? 'Personalized MyKey message' : 'Standard maturity notice') + '</h2>' +
      (a.key === 'paused' ? '<div class="notice">Personalized outreach is paused because the customer turned off consent. Only the standard notice is available.</div>' : '') +
      '<div class="msg" style="background:var(--soft)">' + esc(draftFor(p)) + '</div><p class="note">Drafts never mention transaction details. The customer decides whether to share why they moved money.</p>' +
      '<button class="btn" data-act="sendOutreach" data-id="' + p.id + '"' + (p.prefs.app ? '' : ' disabled') + '>' + (a.key === 'outreach' ? 'Send via MyKey' : 'Send standard notice') + '</button>' + (p.prefs.app ? '' : '<p class="note">Customer turned off in-app messages.</p>') +
      (sent.length ? '<h3 style="margin-top:18px">Sent</h3>' + sent.map(x => '<p class="note">' + fmtTime(x.at) + ' · ' + esc(x.subject) + (x.response ? ' · <b>' + esc(x.response) + '</b>' : x.read ? ' · read' : ' · unread') + '</p>').join('') : '') + '</div></div>';
  }

  function admProfiles() {
    const e = ui.editing === 'new' ? null : prof(ui.editing);
    return '<div class="greet"><h1>profiles.</h1><span><button class="btn small" data-act="newProfile">Add profile</button> <button class="btn small ghost" data-act="export">Export data</button> <label class="btn small ghost" style="cursor:pointer">Import data<input type="file" id="importFile" accept="application/json" hidden></label> <button class="btn small ghost" data-act="reset">Reset demo</button></span></div>' +
      (ui.editing ? profileForm(e) : '') +
      '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Name</th><th>User ID</th><th>Goal</th><th class="num">CD</th><th>Matures</th><th>Consent</th><th></th></tr></thead><tbody>' +
      db.profiles.map(p => '<tr><th>' + esc(p.name) + '<br><small class="muted">' + esc(p.segment) + '</small></th><td>' + esc(p.userId) + '</td><td>' + esc(p.goal) + '<br><small class="muted">' + m(p.goalAmount) + '</small></td><td class="num">' + m(p.cd.amount) + '</td><td>' + p.cd.maturesInDays + ' days</td><td>' + (p.prefs.personalized ? '<span class="chip ok">On</span>' : '<span class="chip warn">Off</span>') + '</td>' +
        '<td style="white-space:nowrap"><button class="btn small ghost" data-act="edit" data-id="' + p.id + '">Edit</button> <button class="btn small ghost" data-act="impersonate" data-id="' + p.id + '">Sign in as</button> <button class="btn small ghost" data-act="del" data-id="' + p.id + '">Delete</button></td></tr>').join('') +
      '</tbody></table></div><p class="note">Profiles, plans and messages save in this browser. Use Export to share a set of profiles with teammates, and Import to load it on another computer.</p></div>';
  }
  function profileForm(p) {
    const v = p || { name: '', userId: '', segment: '', tenureYears: 3, goal: 'Emergency savings', goalAmount: 4000, needMonths: 6, checking: 2500, savings: 1000, cd: { amount: 10000, apy: 4.5, termMonths: 12, maturesInDays: 14, number: String(1000 + Math.floor(Math.random() * 9000)) }, transfers: [], prefs: { personalized: true, insights: true }, notes: '' };
    const tx = recentTransfers(v);
    return '<div class="panel" style="margin-bottom:20px"><h2>' + (p ? 'Edit ' + esc(p.name) : 'New profile') + '</h2><form data-form="profile"><div class="formgrid">' +
      fld('Full name', 'name', v.name, 'text', 'required') + fld('User ID', 'userId', v.userId, 'text', 'required') + fld('Segment', 'segment', v.segment) +
      fld('Years as customer', 'tenureYears', v.tenureYears, 'number', 'min="0" step="1"') + fld('Savings goal', 'goal', v.goal) + fld('Goal amount ($)', 'goalAmount', v.goalAmount, 'number', 'min="0" step="100"') +
      fld('Need goal money in (months)', 'needMonths', v.needMonths, 'number', 'min="1" max="24"') + fld('Checking ($)', 'checking', v.checking, 'number', 'min="0" step="any"') + fld('Savings ($)', 'savings', v.savings, 'number', 'min="0" step="any"') +
      fld('CD balance ($)', 'cdAmount', v.cd.amount, 'number', 'min="0" step="100"') + fld('CD APY (%)', 'cdApy', v.cd.apy, 'number', 'min="0" step="0.01"') + fld('CD term (months)', 'cdTerm', v.cd.termMonths, 'number', 'min="1" max="60"') +
      fld('CD matures in (days)', 'cdDays', v.cd.maturesInDays, 'number', 'min="0" max="365"') + fld('External transfers, last 30 days', 'txCount', tx.length, 'number', 'min="0" max="20"') + fld('Typical transfer ($)', 'txAmount', tx[0] ? tx[0].amount : 500, 'number', 'min="0" step="50"') +
      '</div><p style="display:flex;gap:18px;flex-wrap:wrap;margin:14px 0"><label><input type="checkbox" name="personalized"' + (v.prefs.personalized ? ' checked' : '') + '> Personalized outreach consent</label><label><input type="checkbox" name="insights"' + (v.prefs.insights ? ' checked' : '') + '> Activity insights consent</label><label><input type="checkbox" name="goalConfirmed"' + (v.goalConfirmed ? ' checked' : '') + '> Goal confirmed by customer</label></p>' +
      '<label class="f" for="f-notes">Notes</label><textarea class="t" id="f-notes" name="notes" rows="2">' + esc(v.notes) + '</textarea>' +
      '<input type="hidden" name="id" value="' + (p ? p.id : '') + '"><p style="margin-top:14px"><button class="btn">Save profile</button> <button type="button" class="btn ghost" data-act="cancelEdit">Cancel</button></p></form></div>';
  }

  function admContent() {
    const pending = db.reviews.filter(r => r.status === 'pending'), done = db.reviews.filter(r => r.status !== 'pending');
    return '<div class="greet"><h1>answer review.</h1><span class="muted">Customer flags from MyKey</span></div>' +
      '<div class="panel"><h2>Pending (' + pending.length + ')</h2>' + (pending.length ? pending.map(r =>
        '<div class="msg"><header><span>' + esc(r.profile) + ' · topic: ' + esc(r.intent) + '</span><span>' + fmtTime(r.at) + '</span></header><p><b>Question:</b> ' + esc(r.question) + '</p><p><b>Current answer:</b> ' + esc(r.answer) + '</p><p class="muted">' + esc(r.reason) + '</p>' +
        '<label class="f" for="rv-' + r.id + '">Revised answer</label><textarea class="t" id="rv-' + r.id + '" rows="4">' + esc(r.proposed || r.answer) + '</textarea>' +
        '<p style="margin-top:10px"><button class="btn small" data-act="approve" data-id="' + r.id + '">Approve and publish to MyKey</button> <button class="btn small ghost" data-act="reject" data-id="' + r.id + '">Keep current answer</button></p></div>').join('') : '<p class="muted">Nothing waiting. Flags appear here when a customer marks a MyKey answer unclear.</p>') + '</div>' +
      '<div class="panel" style="margin-top:20px"><h2>Published answers</h2>' + (Object.keys(db.content).length ? '<table><tbody>' + Object.entries(db.content).map(([k, v]) => '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td><td><button class="btn small ghost" data-act="revert" data-k="' + k + '">Revert</button></td></tr>').join('') + '</tbody></table>' : '<p class="muted">All answers use the default script.</p>') +
      (done.length ? '<h3 style="margin-top:16px">History</h3>' + done.map(r => '<p class="note">' + fmtTime(r.at) + ' · ' + esc(r.intent) + ' · ' + esc(r.status) + '</p>').join('') : '') +
      '<p class="note">Pilot measure: compare answer helpfulness and repeat questions before and after each revision. In production, compliance approves wording before it publishes.</p></div>';
  }

  function admAppts() {
    return '<div class="greet"><h1>banker requests.</h1></div><div class="panel">' + (db.appointments.length ? db.appointments.slice().reverse().map(a =>
      '<div class="msg"><header><span>' + esc(a.name) + ' · ' + esc(a.method) + ', ' + esc(a.slot) + '</span><span>' + fmtTime(a.at) + '</span></header><p style="white-space:pre-line">' + esc(a.context) + '</p>' +
      '<span class="chip ' + (a.status === 'Completed' ? 'ok' : 'red') + '">' + esc(a.status) + '</span> ' +
      (a.status === 'Requested' ? '<button class="btn small" data-act="appt" data-id="' + a.id + '" data-s="Scheduled">Mark scheduled</button>' : a.status === 'Scheduled' ? '<button class="btn small" data-act="appt" data-id="' + a.id + '" data-s="Completed">Mark completed</button>' : '') + '</div>').join('')
      : '<p class="muted">No requests yet. Customers request a banker from the Checkup, MyKey chat or an outreach message.</p>') + '</div>';
  }

  function admRules() {
    const r = db.rules, t = db.rates;
    const n = (path, label, val, step) => '<label class="f" for="b-' + path + '">' + label + '</label><input class="t" id="b-' + path + '" type="number" step="' + (step || 1) + '" value="' + val + '" data-bind="' + path + '">';
    return '<div class="greet"><h1>rules & rates.</h1><span class="muted">Changes apply instantly across the demo</span></div><div class="grid2"><div class="panel"><h2>Outreach priority rules</h2><div class="formgrid" style="grid-template-columns:1fr 1fr">' +
      n('rules.windowDays', 'Maturity window (days)', r.windowDays) + n('rules.wMaturity', 'Points: matures in window', r.wMaturity) +
      n('rules.transfersMin', 'Min. external transfers (30 days)', r.transfersMin) + n('rules.wTransfers', 'Points: repeated transfers', r.wTransfers) +
      n('rules.largeBalance', 'Large CD balance ($)', r.largeBalance, 500) + n('rules.wLarge', 'Points: large balance', r.wLarge) +
      n('rules.newTenureYears', 'Newer relationship (years)', r.newTenureYears) + n('rules.wTenure', 'Points: newer relationship', r.wTenure) +
      n('rules.threshold', 'Review threshold', r.threshold) + '</div><p class="note">Consent always overrides the score: a customer with personalization off only gets the standard notice.</p></div>' +
      '<div class="panel"><h2>Illustrative rates</h2><p class="note">Placeholders for the demo. Not KeyBank rates.</p><div class="formgrid" style="grid-template-columns:1fr 1fr">' +
      n('rates.savings', 'Savings APY (%)', t.savings, 0.05) + n('rates.noPenalty', 'Flexible CD APY (%)', t.noPenalty, 0.05) + n('rates.cd6', '6-month CD APY (%)', t.cd6, 0.05) + n('rates.cd12', '12-month CD APY (%)', t.cd12, 0.05) + n('rates.cd18', '18-month CD APY (%)', t.cd18, 0.05) + n('rates.penaltyDays', 'Early withdrawal penalty (days of interest)', t.penaltyDays) +
      '</div></div></div>';
  }

  function admPilot() {
    const P = db.pilot, lift = P.treatRate - P.controlRate, inc = P.maturing * lift / 100;
    const value = inc * P.spread / 100, cost = P.customers * P.costPerCustomer + P.platformCost, roi = cost ? (value - cost) / cost * 100 : 0;
    const n = (k, label, step) => '<label class="f" for="pl-' + k + '">' + label + '</label><input class="t" id="pl-' + k + '" type="number" step="' + (step || 1) + '" value="' + P[k] + '" data-bind="pilot.' + k + '">';
    return '<div class="greet"><h1>pilot economics.</h1><span class="muted">90-day controlled pilot · illustrative inputs</span></div>' +
      '<div class="grid2"><div class="panel"><h2>Inputs</h2><div class="formgrid" style="grid-template-columns:1fr 1fr">' +
      n('customers', 'Customers in Checkup group') + n('maturing', 'Maturing CD dollars in Checkup group ($)', 100000) + n('controlRate', 'Usual service: retained after 30 days (%)', 0.5) + n('treatRate', 'Checkup: retained after 30 days (%)', 0.5) + n('spread', 'Funding value of retained deposits (% per year)', 0.1) + n('costPerCustomer', 'Outreach and banker cost per customer ($)', 0.5) + n('platformCost', 'Build and compliance cost ($)', 1000) +
      '</div></div><div class="panel"><h2>Results</h2><div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><strong>' + lift.toFixed(1) + ' pts</strong><span>Retention lift</span></div><div class="kpi"><strong>' + m(inc) + '</strong><span>Incremental dollars retained</span></div><div class="kpi"><strong>' + m(value) + '</strong><span>Annual funding value</span></div><div class="kpi"><strong>' + m(cost) + '</strong><span>Pilot cost</span></div></div>' +
      '<p><b>Return on pilot cost: ' + Math.round(roi) + '%</b> in the first year at these inputs.</p><p class="note">Funding value = incremental retained dollars × the cost difference versus replacement funding (for example, wholesale or promotional deposits). Replace with KeyBank\'s internal funds-transfer-pricing figures.</p></div></div>' +
      '<div class="panel" style="margin-top:20px"><h2>Design</h2><table><thead><tr><th>Group</th><th class="num">At maturity</th><th class="num">At KeyBank after 30 days</th><th class="num">Retained</th></tr></thead><tbody>' +
      '<tr><th>Checkup</th><td class="num">' + m(P.maturing) + '</td><td class="num">' + m(P.maturing * P.treatRate / 100) + '</td><td class="num">' + P.treatRate + '%</td></tr>' +
      '<tr><th>Usual service</th><td class="num">' + m(P.maturing) + '</td><td class="num">' + m(P.maturing * P.controlRate / 100) + '</td><td class="num">' + P.controlRate + '%</td></tr></tbody></table>' +
      '<p class="note">Randomly assign eligible, opted-in customers to the Checkup or usual service. Measure the share of starting CD dollars still at KeyBank 30 days after maturity across all assigned customers (intent to treat). Track customer retention and net external deposit flows separately; internal transfers count as retained but add zero new deposits.</p></div>';
  }

  function admAudit() {
    return '<div class="greet"><h1>audit log.</h1><span class="muted">Every consent change, outreach and approval</span></div><div class="panel">' + (db.audit.length ? '<table><thead><tr><th>Time</th><th>Who</th><th>What</th></tr></thead><tbody>' + db.audit.map(a => '<tr><td class="muted" style="white-space:nowrap">' + fmtTime(a.at) + '</td><td>' + esc(a.who) + '</td><td>' + esc(a.what) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">Empty.</p>') + '</div>';
  }

  /* ---------- render + routing ---------- */
  function parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [route, sub] = h.split('/');
    ui.route = route || 'home'; ui.sub = sub || '';
    if (ui.route === 'app' && !me()) { ui.route = 'home'; ui.drawer = 'signon'; }
    if (ui.route === 'admin' && !db.admin) { ui.route = 'home'; ui.drawer = 'admin'; }
    if (ui.route === 'app' && !ui.sub) ui.sub = 'accounts';
    if (ui.route === 'admin' && !ui.sub) ui.sub = 'overview';
  }
  function go(to) { if (location.hash === '#/' + to) { parse(); render(); } else location.hash = '/' + to; }
  function render() {
    const active = document.activeElement && document.activeElement.id;
    const body = ui.route === 'app' ? renderApp() : ui.route === 'admin' ? renderAdmin() : renderHome();
    byId('root').innerHTML = body + renderDrawer();
    document.title = (ui.route === 'admin' ? 'Banker Console' : ui.route === 'app' ? 'MyKey' : 'MyKey Savings Checkup') + ' | Case Competition Prototype';
    renderChat();
    if (active && byId(active)) byId(active).focus();
    if (ui.drawer && !active) { const f = document.querySelector('.drawer input,.drawer button.btn'); if (f) f.focus(); }
  }
  function refreshCheckup() {
    const p = me(); if (!p || ui.sub !== 'checkup') return;
    byId('ck-figs').innerHTML = ckFigs(p);
    byId('ck-opts').innerHTML = ckOpts(p);
    byId('ck-stress').innerHTML = ckStress(p);
    byId('ck-summary').innerHTML = ckSummary(p);
  }

  function signIn(id) {
    db.session = id; ui.drawer = null; ui.chatOpen = false; ui.prefill = '';
    const p = prof(id); log(p.name, 'Signed in to MyKey (demo)'); save(); go('app/accounts');
  }
  function addAppointment(p) {
    const w = work(p), o = options(p).find(x => x.id === w.choice);
    const method = byId('ck-method') ? byId('ck-method').value : 'Phone call', slot = byId('ck-slot') ? byId('ck-slot').value : 'Next available';
    const qs = p.chat.filter(c => c.who === 'me').slice(-3).map(c => '"' + c.text + '"').join(', ');
    db.appointments.push({ id: uid('a'), profileId: p.id, name: p.name, method, slot, status: 'Requested', at: Date.now(),
      context: 'Goal: ' + p.goal + (p.goalConfirmed ? ' (confirmed)' : ' (not confirmed)') + '\nCheckup: ' + m(w.reserve) + ' accessible, ' + m(p.cd.amount - w.reserve) + ' to ' + o.name.toLowerCase() + (p.plan ? ' (plan saved)' : ' (draft)') + '\nCD: ' + m(p.cd.amount) + ' matures ' + matDate(p) + (qs ? '\nRecent MyKey questions: ' + qs : '') });
    log(p.name, 'Requested a banker: ' + method + ', ' + slot);
    save();
  }

  /* ---------- events ---------- */
  const acts = {
    go: t => { ui.drawer = null; go(t.dataset.to); },
    scroll: t => { const el = byId(t.dataset.to); if (el) el.scrollIntoView({ behavior: 'smooth' }); },
    external: () => window.open('https://www.key.com/personal/index.html', '_blank', 'noopener'),
    noop: () => {},
    drawer: t => { ui.drawer = t.dataset.d; if (t.dataset.d !== 'enroll') ui.prefill = ''; render(); },
    closeDrawer: () => { ui.drawer = null; render(); },
    signin: t => signIn(t.dataset.id),
    impersonate: t => signIn(t.dataset.id),
    signout: () => { const p = me(); if (p) log(p.name, 'Signed off'); db.session = null; ui.chatOpen = false; save(); go('home'); toast('Signed off.'); },
    enterAdmin: () => { db.admin = true; ui.drawer = null; log('Banker', 'Entered banker console'); save(); go('admin/overview'); },
    exitAdmin: () => { db.admin = false; save(); go('home'); },
    openChat: () => { ui.chatOpen = true; renderChat(); const i = byId('chatin'); if (i) i.focus(); },
    closeChat: () => { ui.chatOpen = false; renderChat(); },
    chip: t => { const p = me(); const label = CHIPS.find(c => c[0] === t.dataset.k)[1]; ask(p, label, t.dataset.k); renderChat(); },
    rate: t => { const p = me(), c = p.chat.find(x => x.id === t.dataset.id); c.rated = true; save(); renderChat(); },
    flag: t => {
      const p = me(), i = p.chat.findIndex(x => x.id === t.dataset.id), c = p.chat[i], q = p.chat[i - 1];
      c.flagged = true;
      db.reviews.push({ id: uid('r'), intent: c.intent, question: q && q.who === 'me' ? q.text : '(no question)', answer: c.text, reason: 'Customer flagged this answer as unclear or wrong.', profile: p.name, status: 'pending', proposed: '', at: Date.now() });
      log(p.name, 'Flagged a MyKey answer (' + c.intent + ') for review'); save(); renderChat(); toast('Sent to the review queue in the banker console.');
    },
    requestBanker: () => { const p = me(); addAppointment(p); if (ui.sub === 'checkup') render(); else renderChat(); toast('Banker request sent with your plan attached.'); },
    confirmPlan: () => {
      const p = me(), w = work(p), o = options(p).find(x => x.id === w.choice);
      const isNew = !p.plan;
      p.plan = { reserve: w.reserve, choice: o.id, label: o.name, dest: o.dest, months: w.months, at: Date.now() };
      p.inbox.push({ id: uid('x'), kind: 'notice', from: 'MyKey', subject: 'Your Savings Checkup plan is saved', body: m(w.reserve) + ' stays accessible and ' + m(p.cd.amount - w.reserve) + ' goes to: ' + o.name + '. You can change this until ' + matDate(p) + '.', at: Date.now(), read: false });
      log(p.name, (isNew ? 'Saved' : 'Updated') + ' Checkup plan: ' + m(w.reserve) + ' accessible, rest to ' + o.name);
      save(); render(); toast('Plan saved. A confirmation is in Messages.');
    },
    msgRead: t => { const x = me().inbox.find(i => i.id === t.dataset.id); x.read = true; save(); render(); },
    msgReply: t => {
      const p = me(), x = p.inbox.find(i => i.id === t.dataset.id); x.read = true; x.response = t.dataset.r;
      log(p.name, 'Responded to outreach: ' + t.dataset.r);
      if (t.dataset.r === 'Requested a banker') { addAppointment(p); toast('A banker will reach out.'); }
      save();
      if (t.dataset.r === 'Opened Checkup') go('app/checkup'); else render();
    },
    clearChat: () => { const p = me(); p.chat = []; log(p.name, 'Deleted MyKey chat history'); save(); render(); toast('Chat history deleted.'); },
    sel: t => { ui.sel = t.dataset.id; render(); const d = document.querySelector('.grid2'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    confirmGoal: t => { const p = prof(t.dataset.id); p.goalConfirmed = true; log('Banker', 'Recorded stated goal for ' + p.name + ': ' + p.goal); save(); render(); },
    sendOutreach: t => {
      const p = prof(t.dataset.id), a = action(p);
      p.inbox.push({ id: uid('x'), kind: a.key === 'outreach' ? 'outreach' : 'notice-std', from: a.key === 'outreach' ? 'Your KeyBank banker via MyKey' : 'KeyBank', subject: a.key === 'outreach' ? 'Your CD matures soon: your Savings Checkup is ready' : 'Your CD maturity notice', body: draftFor(p), at: Date.now(), read: false });
      log('Banker', (a.key === 'outreach' ? 'Sent personalized outreach to ' : 'Sent standard notice to ') + p.name); save(); render(); toast('Delivered to ' + first(p) + '\'s MyKey inbox.');
    },
    newProfile: () => { ui.editing = 'new'; render(); },
    edit: t => { ui.editing = t.dataset.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    cancelEdit: () => { ui.editing = null; render(); },
    del: t => {
      const p = prof(t.dataset.id);
      if (!confirm('Delete ' + p.name + '? This removes the profile from this browser.')) return;
      db.profiles = db.profiles.filter(x => x.id !== p.id); if (db.session === p.id) db.session = null;
      log('Banker', 'Deleted profile ' + p.name); save(); render();
    },
    export: () => {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mykey-demo-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    reset: () => { if (!confirm('Reset all demo data to the original profiles?')) return; db = clone(SEED); ui.sel = null; ui.editing = null; save(); go('home'); toast('Demo data reset.'); },
    approve: t => {
      const r = db.reviews.find(x => x.id === t.dataset.id), text = byId('rv-' + r.id).value.trim();
      if (!text) { toast('Write the revised answer first.'); return; }
      r.status = 'approved'; r.proposed = text; db.content[r.intent] = text;
      log('Banker', 'Approved revised MyKey answer for "' + r.intent + '"'); save(); render(); toast('Published. MyKey now uses the revised answer.');
    },
    reject: t => { const r = db.reviews.find(x => x.id === t.dataset.id); r.status = 'kept'; log('Banker', 'Kept current answer for "' + r.intent + '"'); save(); render(); },
    revert: t => { delete db.content[t.dataset.k]; log('Banker', 'Reverted answer for "' + t.dataset.k + '"'); save(); render(); },
    appt: t => { const a = db.appointments.find(x => x.id === t.dataset.id); a.status = t.dataset.s; log('Banker', 'Marked request from ' + a.name + ' ' + a.status.toLowerCase()); save(); render(); }
  };

  const forms = {
    signon: f => {
      const id = f.uid.value.trim().toLowerCase();
      if (!id) { toast('Enter a User ID or pick a demo profile.'); return; }
      const p = db.profiles.find(x => x.userId.toLowerCase() === id || x.id === id || x.name.toLowerCase() === id);
      if (p) signIn(p.id); else { ui.prefill = id; ui.drawer = 'enroll'; render(); toast('No profile for "' + id + '". Enroll it as a new demo profile.'); }
    },
    enroll: f => {
      const fd = new FormData(f), name = String(fd.get('name')).trim(), userId = String(fd.get('userId')).trim();
      if (db.profiles.some(p => p.userId.toLowerCase() === userId.toLowerCase())) { toast('That User ID is taken.'); return; }
      const p = newProfile({ name, userId, goal: String(fd.get('goal') || 'Emergency savings'), goalAmount: num(fd.get('goalAmount'), 4000), needMonths: num(fd.get('needMonths'), 6),
        cd: { amount: num(fd.get('cdAmount'), 10000), maturesInDays: num(fd.get('days'), 14) }, prefs: { personalized: fd.get('personalized') === 'on' } });
      p.goalConfirmed = true;
      db.profiles.push(p); log(name, 'Enrolled a new demo profile'); signIn(p.id);
    },
    profile: f => {
      const fd = new FormData(f), id = fd.get('id'), existing = id && prof(id);
      const userId = String(fd.get('userId')).trim();
      if (db.profiles.some(p => p.userId.toLowerCase() === userId.toLowerCase() && p.id !== id)) { toast('That User ID is taken.'); return; }
      const count = Math.max(0, Math.min(20, num(fd.get('txCount')))), amt = num(fd.get('txAmount'), 500);
      const data = {
        name: String(fd.get('name')).trim(), userId, segment: String(fd.get('segment')).trim() || 'Demo customer', tenureYears: num(fd.get('tenureYears'), 3),
        goal: String(fd.get('goal')).trim() || 'Emergency savings', goalAmount: num(fd.get('goalAmount')), needMonths: num(fd.get('needMonths'), 6),
        checking: num(fd.get('checking')), savings: num(fd.get('savings')), notes: String(fd.get('notes') || ''), goalConfirmed: fd.get('goalConfirmed') === 'on',
        transfers: Array.from({ length: count }, (_, i) => ({ daysAgo: Math.round((i + 1) * 28 / (count + 1)), amount: amt, to: 'External bank ••' + (10 + (userId.length * 7) % 89) }))
      };
      const cd = { amount: num(fd.get('cdAmount'), 10000), apy: num(fd.get('cdApy'), 4.5), termMonths: num(fd.get('cdTerm'), 12), maturesInDays: num(fd.get('cdDays'), 14) };
      if (existing) {
        Object.assign(existing, data); Object.assign(existing.cd, cd);
        existing.prefs.personalized = fd.get('personalized') === 'on'; existing.prefs.insights = fd.get('insights') === 'on';
        delete existing.work; log('Banker', 'Edited profile ' + existing.name);
      } else {
        const p = newProfile(Object.assign(data, { cd, prefs: { personalized: fd.get('personalized') === 'on', insights: fd.get('insights') === 'on' } }));
        db.profiles.push(p); log('Banker', 'Added profile ' + p.name);
      }
      ui.editing = null; save(); render(); toast('Profile saved.');
    },
    goal: f => {
      const p = me(); p.goal = f.goal.value.trim() || p.goal; p.goalAmount = num(f.goalAmount.value, p.goalAmount); p.goalConfirmed = true; delete p.work;
      log(p.name, 'Confirmed savings goal: ' + p.goal + ' (' + m(p.goalAmount) + ')'); save(); render(); toast('Goal saved.');
    },
    chat: f => {
      const q = f.q.value.trim(); if (!q) return;
      ask(me(), q);
      const y = window.scrollY; render(); window.scrollTo(0, y); // re-render: a stated goal can change the page
      const i = byId('chatin'); if (i) i.focus();
    }
  };

  function newProfile(d) {
    const base = String(d.name || 'customer').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'customer';
    const initials = String(d.name || '?').split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase();
    return Object.assign({
      id: uid(base), initials, segment: 'Demo customer', tenureYears: 3, checking: 2500, savings: 1000, transfers: [], goalConfirmed: false, plan: null, inbox: [], chat: [], notes: ''
    }, d, {
      cd: Object.assign({ amount: 10000, apy: 4.5, termMonths: 12, maturesInDays: 14, number: String(1000 + Math.floor(Math.random() * 9000)) }, d.cd),
      prefs: Object.assign({ personalized: true, insights: true, app: true, email: false, sms: false, leadDays: 14, detail: 'plain' }, d.prefs)
    });
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || !acts[t.dataset.act]) return;
    if (t.tagName === 'INPUT') return;
    e.preventDefault(); acts[t.dataset.act](t, e);
  });
  document.addEventListener('submit', e => { const f = e.target; if (forms[f.dataset.form]) { e.preventDefault(); forms[f.dataset.form](f); } });
  document.addEventListener('input', e => {
    const t = e.target, p = me();
    if (t.dataset.live && p) { work(p)[t.dataset.live] = num(t.value); save(); if (t.dataset.live === 'expense') byId('ck-stress').innerHTML = ckStress(p); else refreshCheckup(); }
  });
  document.addEventListener('change', e => {
    const t = e.target, p = me();
    if (t.dataset.ck && p) { work(p)[t.dataset.ck] = t.dataset.ck === 'months' ? num(t.value) : t.value; save(); refreshCheckup(); return; }
    if (t.dataset.live && p) { log(p.name, 'Adjusted Checkup ' + t.dataset.live + ' to ' + m(t.value)); save(); return; }
    if (t.dataset.pref && p) { p.prefs[t.dataset.pref] = t.checked; log(p.name, 'Turned ' + (t.checked ? 'on' : 'off') + ' ' + t.dataset.pref + ' preference'); save(); render(); toast('Preference saved.'); return; }
    if (t.dataset.prefsel && p) { const k = t.dataset.prefsel; p.prefs[k] = k === 'leadDays' ? num(t.value) : t.value; log(p.name, 'Set ' + k + ' to ' + t.value); save(); render(); return; }
    if (t.dataset.bind) { const [a, b] = t.dataset.bind.split('.'); db[a][b] = num(t.value, db[a][b]); log('Banker', 'Set ' + t.dataset.bind + ' to ' + t.value); save(); render(); return; }
    if (t.dataset.notes) { const q = prof(t.dataset.notes); q.notes = t.value; save(); return; }
    if (t.id === 'importFile' && t.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        try { const d = JSON.parse(r.result); if (!d || !Array.isArray(d.profiles) || !d.rules || !d.rates) throw new Error('bad'); d.version = SEED.version; db = Object.assign(clone(SEED), d); save(); render(); toast('Imported ' + db.profiles.length + ' profiles.'); }
        catch (err) { toast('That file is not a MyKey demo export.'); }
      };
      r.readAsText(t.files[0]);
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ui.drawer) { ui.drawer = null; render(); } });
  window.addEventListener('hashchange', () => { parse(); render(); window.scrollTo(0, 0); });

  parse(); render();
})();
