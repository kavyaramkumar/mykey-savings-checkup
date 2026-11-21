'use strict';
(function () {
  /* ================= helpers ================= */
  const KEY = 'mykey-mobile-v1';
  const $ = id => document.getElementById(id);
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const m = v => usd.format(Math.round(Number(v) || 0));
  const pct = v => Number(v).toFixed(2) + '%';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayKey = d => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const TODAY = dayKey();
  const YESTERDAY = dayKey(new Date(Date.now() - 864e5));
  const DAYNUM = Math.floor(new Date(TODAY + 'T12:00:00').getTime() / 864e5);
  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  function shuffle(arr, seed) { const r = rng(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const keySvg = '<svg viewBox="0 0 34 16" aria-hidden="true"><circle cx="7" cy="8" r="5" fill="none" stroke="#cc0000" stroke-width="3"/><path d="M12 8h20M26 8v5M30.5 8v4" stroke="#cc0000" stroke-width="3" fill="none"/></svg>';
  const matDate = days => new Date(Date.now() + days * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  /* ================= data ================= */
  // Illustrative demo rates. Not KeyBank offers.
  const R = { key: 3.25, boost: 4.00, cd6: 3.90, cd12: 3.75, cd18: 3.55, flex: 3.40, penaltyDays: 90 };
  const P = {
    young: { id: 'young', name: 'Jordan', age: 26, emoji: '🚀', label: 'Young professional', job: 'Marketing associate, rents downtown',
      problem: 'Thinking about moving savings to a digital bank advertising a higher rate.', game: 'rate' },
    established: { id: 'established', name: 'Michael', age: 48, emoji: '🏡', label: 'Established saver', job: 'Homeowner, saving for repairs',
      problem: 'A $10,000 CD matures in 14 days, and other banks are sending offers.', game: 'ladder', cd: 10000, days: 14 },
    variable: { id: 'variable', name: 'Sam', age: 31, emoji: '🚗', label: 'Variable income', job: 'Freelance designer and rideshare driver',
      problem: 'Income swings month to month, so saving feels impossible.', game: 'lean', income: [3200, 5100, 2400, 4600, 2900, 6100], bills: 3000 }
  };
  const PLAN0 = {
    young: { bal: 6000, comp: 4.10, jar: 'Emergency fund', goal: 5000, auto: 100, roundups: true, started: false },
    established: { reserve: 3000, choice: 'renew', offer: 4.25, locked: false, review: false },
    variable: { pay: 3500, pct: 10, lean: true, started: false }
  };
  const fresh = () => ({ persona: null, tab: 'home', chats: {}, prefs: { tips: true, activity: true, remind: true }, plans: JSON.parse(JSON.stringify(PLAN0)), games: {}, streak: { last: null, count: 0 }, badges: {} });
  function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.plans) return s; } catch (e) { /* storage blocked */ } return fresh(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  let S = load();
  const ui = { game: null, sheet: null, kw: '', dive: null, rh: null, lm: null, tick: null };
  const me = () => P[S.persona];
  const plan = () => S.plans[S.persona];
  const day = () => (S.games[TODAY] = S.games[TODAY] || {});

  let toastT;
  function toast(t) {
    const app = $('app'); let el = app.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); app.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2600);
  }
  const BADGES = [['first', '🎮 First game'], ['streak3', '🔥 3-day streak'], ['kw3', '🔤 Keyword in 3'], ['deep', '🌊 Past 450 m'], ['rh5', '🧠 5/5 Rate or Hype'], ['ladder', '🪜 Perfect ladder'], ['lean', '🛟 No overdrafts'], ['plan', '✅ Started a plan']];
  function badge(id) { if (!S.badges[id]) { S.badges[id] = TODAY; const b = BADGES.find(x => x[0] === id); setTimeout(() => toast('Badge earned: ' + b[1]), 400); } }
  function finishGame(id, result) {
    day()[id] = Object.assign({ done: true }, result);
    if (S.streak.last !== TODAY) { S.streak.count = S.streak.last === YESTERDAY ? S.streak.count + 1 : 1; S.streak.last = TODAY; }
    badge('first'); if (S.streak.count >= 3) badge('streak3');
    save();
  }

  /* ================= persona math ================= */
  function youngCalc() {
    const p = S.plans.young, gap = p.bal * (p.comp - R.key) / 100;
    let bal = 0; const monthly = p.auto * 26 / 12 + (p.roundups ? 30 : 0);
    for (let i = 0; i < 12; i++) { bal += monthly; bal *= 1 + R.boost / 1200; }
    const toGoal = monthly > 0 ? Math.ceil(p.goal / monthly) : null;
    return { gap, monthly, year: bal, toGoal, progress: Math.min(100, bal / p.goal * 100) };
  }
  function estOptions() {
    const p = S.plans.established, rest = P.established.cd - p.reserve, lad = (R.cd6 + R.cd12 + R.cd18) / 3;
    return [
      { id: 'renew', name: 'Renew for 12 months', sub: 'Lock today\'s rate', rate: R.cd12 },
      { id: 'ladder', name: '3-step CD ladder', sub: 'Part matures every 6 months', rate: lad },
      { id: 'flex', name: 'Flexible CD', sub: 'Take it out without a penalty after the first week', rate: R.flex },
      { id: 'savings', name: 'All in savings', sub: 'Access anytime, rate can change', rate: R.key }
    ].map(o => Object.assign(o, { interest: rest * o.rate / 100 }));
  }
  function varCalc() {
    const p = S.plans.variable, inc = P.variable.income, bills = P.variable.bills;
    let buf = 300, low = Infinity, lowAt = 0; const path = [];
    inc.forEach((x, i) => { buf += x - p.pay; path.push(buf); if (buf < low) { low = buf; lowAt = i + 1; } });
    const total = inc.reduce((a, b) => a + b, 0);
    const pctSaved = inc.reduce((s, x) => s + (p.lean && x < bills ? 0 : x * p.pct / 100), 0);
    const missed = inc.filter(x => x - bills < 300).length;
    return { end: buf, low, lowAt, path, avg: total / inc.length, pctSaved, fixedSaved: (inc.length - missed) * 300, missed };
  }

  /* ================= assistant ================= */
  const CHIPS = {
    young: ['Is the online bank better?', 'How do Goal Jars work?', 'What\'s a teaser rate?', 'Is my money insured?'],
    established: ['I got a better offer', 'What if I need it early?', 'What\'s a CD ladder?', 'Talk to a banker'],
    variable: ['How does Steady Pay work?', 'I had a slow month', 'How much should I save?', 'Talk to a banker']
  };
  function reply(text) {
    const t = text.toLowerCase(), id = S.persona, p = plan();
    const y = youngCalc(), v = varCalc();
    if (/password|\bpin\b|scam|ssn|social security/.test(t)) return { t: 'I will never ask for your password, PIN, or Social Security number in chat. If someone asks for those claiming to be the bank, hang up and call the number on your card.' };
    if (/insur|fdic|safe/.test(t)) return { t: 'Deposits at FDIC-insured banks are covered up to $250,000 per depositor, per bank, per ownership category. Many online banks are insured too, so check before you move money.' };
    if (/teaser|intro|promo/.test(t)) return { t: 'A teaser rate is a high intro rate that drops after a few months. Always ask: what is the rate after the promo ends? Try the Rate or Hype game to practice spotting them.', go: ['play', 'Play Rate or Hype'] };
    if (/banker|human|person|call|talk/.test(t)) return { t: 'I can connect you with a banker. They will see your plan and this chat, so you will not have to repeat yourself.', banker: true };
    if (/game|play|streak/.test(t)) return { t: 'Your daily game takes under 2 minutes. You are on a ' + S.streak.count + '-day streak.', go: ['play', 'Open games'] };
    if (/why|data|privacy/.test(t)) return { t: 'I use your balances, your goal and, if you allow it, recent activity. You can turn personal tips off anytime in Me.' };
    if (/ladder/.test(t)) return { t: 'A CD ladder splits your money across several terms, so part of it comes back every few months. You get regular access and still lock in rates.', go: ['play', 'Try Ladder Up'] };
    if (/early|penalt|break|withdraw/.test(t)) return { t: 'Taking money out of a CD early usually costs a set number of days of interest. That is why the Checkup keeps what you might need in savings first. Check your CD terms for the exact penalty.' };
    if (id === 'young' && /online|digital|better|switch|bank|high.?yield|rate/.test(t)) return { t: 'On ' + m(p.bal) + ', a ' + pct(p.comp) + ' rate earns about ' + m(y.gap) + ' more a year than ' + pct(R.key) + '. That is ' + m(y.gap / 12) + ' a month. Automatic saving into a Goal Jar adds about ' + m(y.monthly) + ' a month. The habit moves the needle more than the rate.', go: ['plan', 'See the full picture'] };
    if (/jar|goal/.test(t)) return { t: 'Goal Jars are named buckets inside savings. Set an automatic amount each payday, add round-ups, and new money earns a boosted rate. In this concept, Jordan reaches ' + m(y.year) + ' in a year.', go: ['plan', 'Set up a jar'] };
    if (id === 'established' && /offer|competitor|beat|match|better|other bank|rate/.test(t)) {
      const o = estOptions().find(x => x.id === p.choice), rest = P.established.cd - p.reserve, diff = rest * (p.offer - o.rate) / 100;
      return { t: diff > 0 ? 'A ' + pct(p.offer) + ' offer on ' + m(rest) + ' would earn about ' + m(diff) + ' more a year than your current pick. Before you move, ask a banker for a relationship rate review. It takes one tap.' : 'Your KeyBank pick already matches or beats a ' + pct(p.offer) + ' offer on the amount you would lock in.', banker: diff > 0, go: ['plan', 'Compare in my Checkup'] };
    }
    if (/steady|smooth|salary|paycheck/.test(t)) return { t: 'Steady Pay sends you the same amount every month, ' + m(S.plans.variable.pay) + ' in your plan. Big months fill your cushion and slow months draw from it.', go: ['plan', 'Adjust Steady Pay'] };
    if (/slow|lean|bad month|short|tight|broke/.test(t)) return { t: 'That is what the cushion is for. Steady Pay still sends ' + m(S.plans.variable.pay) + ', and Lean-month mode skips saving until income recovers. No guilt, no overdraft.', go: ['plan', 'See my cushion'] };
    if (/how much.*save|save more|percent|%/.test(t)) return { t: 'Try saving a percent instead of a fixed amount. ' + S.plans.variable.pct + '% of every deposit would have saved ' + m(v.pctSaved) + ' over the last 6 months, without ever missing a bill.', go: ['plan', 'Set my percent'] };
    if (/cd|matur|renew/.test(t)) return { t: 'The CD matures on ' + matDate(14) + '. If you do nothing, many CDs renew automatically. The Checkup lets you choose first.', go: ['plan', 'Open my Checkup'] };
    return { t: 'I can help with your plan, rates, CDs, saving on uneven income, or connect you to a banker. Try a suggestion below.' };
  }
  function ask(text) {
    const c = S.chats[S.persona] = S.chats[S.persona] || [];
    c.push({ me: true, t: text });
    const r = reply(text); c.push(r); save();
  }

  /* ================= screens ================= */
  function header() {
    return '<header class="top"><button class="brand" data-a="tab" data-v="home" aria-label="MyKey home">KeyBank ' + keySvg + '<span>MyKey</span></button>' +
      '<button class="proto" data-a="sheet" data-v="about"><i></i>PROTOTYPE · IN MYKEY</button></header>';
  }
  const ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M16 12h.01M18 14h.01"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>'
  };
  function tabbar() {
    const unplayed = !(day()[me().game] || {}).done;
    return '<nav class="tabbar" aria-label="MyKey">' + [['home', 'MyKey'], ['plan', 'My plan'], ['play', 'Play'], ['me', 'Me']].map(([k, l]) =>
      '<button class="' + (S.tab === k && !ui.game ? 'on' : '') + '" data-a="tab" data-v="' + k + '"' + (S.tab === k ? ' aria-current="page"' : '') + '>' + ICON[k] + l + (k === 'play' && unplayed ? '<span class="dot" aria-label="new game"></span>' : '') + '</button>').join('') + '</nav>';
  }

  function onboarding() {
    return '<div class="main onb"><div class="kicker">MyKey prototype</div><h1 class="hi">Who are you saving as?</h1>' +
      '<p class="muted">Pick a customer to see how the MyKey assistant would help them. Everything here is fictional.</p>' +
      Object.values(P).map(p => '<button class="persona" data-a="persona" data-v="' + p.id + '"><span class="av">' + p.emoji + '</span><span><b>' + p.name + ', ' + p.age + ' · ' + p.label + '</b><small>' + p.problem + '</small></span></button>').join('') +
      '<p class="note">Case competition concept. Not operated by or affiliated with KeyBank. Rates are illustrative.</p></div>';
  }

  function heroCard() {
    const id = S.persona;
    if (id === 'young') {
      const y = youngCalc();
      return card('red', 'For you', 'Is a higher rate elsewhere worth it?', 'On your ' + m(plan().bal) + ' in savings, a ' + pct(plan().comp) + ' online rate earns about <b>' + m(y.gap) + ' more a year</b>. See the full picture, plus a way to grow faster without switching.', 'Run my Rate Reality Check');
    }
    if (id === 'established') return card('red', 'Your CD matures ' + matDate(14), 'Your $10,000 CD matures in 14 days', 'Other banks are sending offers. Decide how much stays accessible, then compare any offer side by side.', plan().locked ? 'Review my plan' : 'Start my Savings Checkup');
    return card('red', 'For you', 'Make uneven income feel steady', 'Your last 6 months ranged from $2,400 to $6,100. Pay yourself the same amount every month and let big months fill a cushion.', S.plans.variable.started ? 'Review Steady Pay' : 'Set up Steady Pay');
  }
  function card(cls, kicker, title, body, cta) {
    return '<div class="card ' + cls + '"><div class="kicker">' + kicker + '</div><h2 style="margin-top:4px">' + title + '</h2><p>' + body + '</p><button class="btn white" data-a="tab" data-v="plan">' + cta + '</button></div>';
  }
  function home() {
    const p = me(), c = S.chats[S.persona] || [], g = GAMES[p.game], gd = day()[p.game];
    const bot = h => '<div class="who"><i></i>MyKey · prototype</div><div class="msg bot">' + h + '</div>';
    return '<div class="main" id="main"><div class="thread">' +
      bot('Hi ' + p.name + ' 👋 I am MyKey. ' + (S.prefs.tips ? 'I found something worth a look.' : 'Personal tips are off, so here is your general overview.')) +
      '<div style="max-width:100%">' + heroCard() + '</div>' +
      bot('Your daily 2-minute game is ready' + (S.streak.count ? '. 🔥 ' + S.streak.count + '-day streak' : '') + '.') +
      '<button class="gtile" data-a="game" data-v="' + p.game + '"><span class="ic" style="background:' + g.bg + '">' + g.icon + '</span><span><b>' + g.name + '</b><small>' + g.tag + '</small></span><span class="st">' + (gd && gd.done ? '<span class="chip ok">Done</span>' : '<span class="chip red">Play</span>') + '</span></button>' +
      c.map(x => x.me ? '<div class="msg me">' + esc(x.t) + '</div>' :
        bot(esc(x.t) + ((x.go || x.banker) ? '<div class="row" style="margin-top:8px;flex-wrap:wrap">' + (x.go ? '<button class="btn sm" data-a="tab" data-v="' + x.go[0] + '">' + x.go[1] + '</button>' : '') + (x.banker ? '<button class="btn sm ghost" data-a="banker">Request a banker</button>' : '') + '</div>' : ''))).join('') +
      '</div><div class="chips" aria-label="Suggestions">' + CHIPS[S.persona].map(t => '<button data-a="chip">' + t + '</button>').join('') + '</div></div>' +
      '<form class="ask" data-f="ask"><label class="sr" for="q">Message MyKey</label><input id="q" name="q" autocomplete="off" placeholder="Ask MyKey anything"><button aria-label="Send">↑</button></form>';
  }

  /* ---- plan screens: static controls + [data-out] blocks updated live ---- */
  function outs() {
    const id = S.persona, p = plan();
    if (id === 'young') {
      const y = youngCalc();
      return {
        bal: m(p.bal), comp: pct(p.comp), goal: m(p.goal), auto: m(p.auto),
        gap: '<div class="stat2"><div><b>' + m(y.gap) + '</b><span>more per year elsewhere</span></div><div><b>' + m(y.gap / 12) + '</b><span>per month, before taxes</span></div></div>',
        jar: '<div class="stat2"><div><b>' + m(y.year) + '</b><span>in your jar after 12 months</span></div><div><b>' + (y.toGoal ? y.toGoal + ' mo' : 'n/a') + '</b><span>to reach ' + m(p.goal) + '</span></div></div><div class="bar"><i style="width:' + y.progress + '%"></i></div>' +
          '<p class="small" style="margin-top:10px"><b>The rate gap is ' + m(y.gap) + ' a year. The saving habit is worth ' + m(y.monthly * 12) + ' a year.</b></p>'
      };
    }
    if (id === 'established') {
      const rest = P.established.cd - p.reserve, o = estOptions().find(x => x.id === p.choice), diff = rest * (p.offer - o.rate) / 100;
      return {
        reserve: m(p.reserve), offer: pct(p.offer),
        split: '<div class="stat2"><div><b>' + m(p.reserve) + '</b><span>keep accessible</span></div><div><b>' + m(rest) + '</b><span>to lock in</span></div></div><div class="bar"><i style="width:' + p.reserve / 100 + '%"></i><i class="g" style="width:' + (100 - p.reserve / 100) + '%"></i></div>' +
          '<p class="small" style="margin-top:8px">' + (p.reserve >= 3000 ? '✅ Covers the $3,000 home repair you mentioned.' : '⚠️ That is ' + m(3000 - p.reserve) + ' short of the $3,000 repair you mentioned.') + '</p>',
        opts: estOptions().map(x => '<button class="opt' + (x.id === p.choice ? ' on' : '') + '" data-a="choice" data-v="' + x.id + '"><span><b>' + x.name + '</b><small>' + x.sub + ' · ' + pct(x.rate) + '</small></span><em>+' + m(x.interest) + '/yr</em></button>').join(''),
        compare: diff > 0
          ? '<p>On ' + m(rest) + ', that offer earns about <b>' + m(diff) + ' more a year</b> than your pick.</p><button class="btn dark" data-a="review"' + (p.review ? ' disabled' : '') + '>' + (p.review ? 'Rate review requested ✓' : 'Ask a banker for a rate review') + '</button>'
          : '<p><span class="chip ok">Good news</span> Your KeyBank pick already matches or beats this offer on the amount you lock in.</p>'
      };
    }
    const v = varCalc(), inc = P.variable.income, max = Math.max(...inc, p.pay) * 1.05;
    return {
      pay: m(p.pay), pctv: p.pct + '%',
      bars: inc.map((x, i) => '<div><i class="' + (x >= p.pay ? 'up' : '') + '" style="height:' + (x / max * 100) + '%"></i>' + ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][i] + '</div>').join('') + '<span class="line" style="bottom:calc(' + (p.pay / max * 100) + '% * 124 / 140 + 16px)"><span>' + m(p.pay) + '</span></span>',
      steady: '<div class="stat2"><div><b>' + m(p.pay) + '</b><span>every month, no matter what</span></div><div><b style="color:' + (v.low < 0 ? 'var(--red)' : 'var(--ok)') + '">' + m(v.end) + '</b><span>cushion after 6 months</span></div></div>' +
        (v.low < 0 ? '<p class="small"><span class="chip warn">Too high</span> Your cushion would run dry in month ' + v.lowAt + '. Try a lower Steady Pay.</p>' : '<p class="small"><span class="chip ok">Works</span> Lowest cushion point: ' + m(v.low) + ' in month ' + v.lowAt + '.</p>'),
      saver: '<div class="stat2"><div><b>' + m(v.pctSaved) + '</b><span>saved with ' + p.pct + '% of deposits</span></div><div><b>' + m(v.fixedSaved) + '</b><span>with a fixed $300 (missed ' + v.missed + ' months)</span></div></div>'
    };
  }
  function planScreen() {
    const id = S.persona, p = plan(), o = outs();
    const out = k => '<span data-out="' + k + '">' + o[k] + '</span>';
    const blk = k => '<div data-out="' + k + '">' + o[k] + '</div>';
    const rng = (k, min, max, step, label, ok) => '<label class="lbl" for="r-' + k + '">' + label + '<output>' + out(ok || k) + '</output></label><input id="r-' + k + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + p[k] + '" data-r="' + k + '">';
    const tog = (k, title, desc) => '<div class="toggle"><div><b class="small">' + title + '</b><p>' + desc + '</p></div><span class="sw"><input type="checkbox" data-pt="' + k + '"' + (p[k] ? ' checked' : '') + ' aria-label="' + title + '"><span></span></span></div>';
    let h = '';
    if (id === 'young') {
      h = '<div class="kicker">Rate Reality Check</div><h1 class="hi">Is switching worth it?</h1>' +
        '<div class="card">' + rng('bal', 500, 30000, 500, 'Your savings') + rng('comp', 3, 5.5, 0.05, 'Online bank rate', 'comp') + '<p class="note">Compared with an illustrative ' + pct(R.key) + ' savings rate.</p>' + blk('gap') +
        '<h3 style="margin-top:6px">Also worth weighing</h3><ul class="list"><li><b>1</b>Online savings rates are variable and can drop anytime.</li><li><b>2</b>Transfers between banks can take a day or more when you need cash.</li><li><b>3</b>Keeping it here means one app, instant transfers to checking, and a banker when you want one.</li></ul></div>' +
        '<div class="card"><div class="kicker">Concept · Goal Jars</div><h2>Grow faster without switching</h2><p class="small muted">Name a goal, automate it, and new money earns an illustrative ' + pct(R.boost) + ' boost.</p>' +
        '<div class="seg" role="group" aria-label="Goal">' + ['Emergency fund', 'Travel', 'Move-out'].map(j => '<button class="' + (p.jar === j ? 'on' : '') + '" data-a="jar" data-v="' + j + '">' + j + '</button>').join('') + '</div>' +
        rng('goal', 1000, 20000, 500, 'Goal') + rng('auto', 25, 500, 25, 'Auto-save each payday') + tog('roundups', 'Round-ups', 'Round card purchases to the next dollar, about $30 a month.') + blk('jar') +
        '<button class="btn" style="margin-top:12px" data-a="start">' + (p.started ? 'Jar started ✓' : 'Start my ' + esc(p.jar) + ' jar') + '</button></div>';
    } else if (id === 'established') {
      h = '<div class="kicker">Savings Checkup</div><h1 class="hi">What\'s next for your $10,000?</h1><p class="muted small">CD ending 4417 matures ' + matDate(14) + '.</p>' +
        '<div class="card"><h3>1. Keep what you might need</h3>' + rng('reserve', 0, 10000, 250, 'Keep accessible') + blk('split') + '</div>' +
        '<div class="card"><h3>2. Choose what to do with the rest</h3><p class="note" style="margin:0">Estimated interest per year. Illustrative rates.</p><div class="opts" data-out="opts">' + o.opts + '</div></div>' +
        '<div class="card"><h3>3. Got an offer from another bank?</h3>' + rng('offer', 3.5, 5.5, 0.05, 'Their rate', 'offer') + blk('compare') + '</div>' +
        '<button class="btn" data-a="lock">' + (p.locked ? 'Plan locked in ✓ Tap to update' : 'Lock in my plan') + '</button><p class="note" style="text-align:center">Nothing moves until ' + matDate(14) + '. Change it anytime before then.</p>';
    } else {
      h = '<div class="kicker">Concept · Steady Pay</div><h1 class="hi">Same paycheck, every month</h1>' +
        '<div class="card"><p class="small muted" style="margin:0">Your income the last 6 months</p><div class="bars" data-out="bars">' + o.bars + '</div>' + rng('pay', 2000, 6000, 100, 'Pay myself') + blk('steady') + '</div>' +
        '<div class="card"><div class="kicker">Concept · Percent Saver</div><h2>Save a percent, not a fixed amount</h2>' + rng('pct', 1, 20, 1, 'Save from every deposit', 'pctv') +
        tog('lean', 'Lean-month mode', 'Pause saving automatically when a month comes in under your bills.') + blk('saver') + '</div>' +
        '<button class="btn" data-a="start">' + (p.started ? 'Steady Pay is on ✓' : 'Turn on Steady Pay') + '</button>';
    }
    return '<div class="main" id="main">' + h + '<p class="note">Prototype concept feature. Illustrative numbers, not KeyBank offers.</p></div>';
  }

  /* ================= games ================= */
  const GAMES = {
    keyword: { name: 'Keyword', icon: '🔤', bg: '#e6f4ea', tag: 'Guess the money word in 6 tries' },
    dive: { name: 'Deep Save', icon: '🌊', bg: '#e3f1fb', tag: '7 quick questions. Dive as deep as you can' },
    rate: { name: 'Rate or Hype?', icon: '🧠', bg: '#fdeeee', tag: 'Spot the offers that are not what they seem', who: 'young' },
    ladder: { name: 'Ladder Up', icon: '🪜', bg: '#fff3df', tag: 'Build a CD ladder that pays when you need it', who: 'established' },
    lean: { name: 'Lean Month', icon: '🛟', bg: '#efeafc', tag: 'Six months of uneven pay. Avoid overdrafts', who: 'variable' }
  };
  function playHub() {
    const rec = me().game, d = day();
    const tile = k => { const g = GAMES[k], r = d[k]; return '<button class="gtile" data-a="game" data-v="' + k + '"><span class="ic" style="background:' + g.bg + '">' + g.icon + '</span><span><b>' + g.name + '</b><small>' + g.tag + '</small></span><span class="st">' + (r && r.done ? '<span class="chip ok">' + (r.label || 'Done') + '</span>' : '<span class="chip">Play</span>') + '</span></button>'; };
    return '<div class="main" id="main"><div class="kicker">MyKey daily</div><h1 class="hi">Play</h1>' +
      '<div class="card dark streak"><span class="flame">🔥</span><div><b style="font-size:20px">' + S.streak.count + '-day streak</b><p class="small" style="margin:0;color:#ccc">Under 2 minutes a day. Each game ends with one tap into your plan.</p></div></div>' +
      '<h3>Made for ' + me().label.toLowerCase() + 's</h3>' + tile(rec) +
      '<h3 style="margin-top:14px">Everyone\'s dailies</h3>' + tile('keyword') + tile('dive') +
      '<h3 style="margin-top:14px">Try other customers\' games</h3>' + Object.keys(GAMES).filter(k => GAMES[k].who && k !== rec).map(tile).join('') +
      '<h3 style="margin-top:14px">Badges</h3><div class="badges">' + BADGES.map(([k, l]) => '<span class="badge' + (S.badges[k] ? ' got' : '') + '">' + l + '</span>').join('') + '</div>' +
      '<p class="note">Why games: a reason to open MyKey daily, practice with the same ideas the plan uses, then act on them.</p></div>';
  }
  function gameShell(k, body) {
    const g = GAMES[k];
    return '<div class="main" id="main"><div class="gamehead"><button class="back" data-a="exitgame" aria-label="Back to games">←</button><div><b>' + g.icon + ' ' + g.name + '</b><div class="small muted">' + g.tag + '</div></div></div>' + body + '</div>';
  }
  function tieIn(text, cta) { return '<div class="card" style="background:var(--tint)"><p class="small" style="margin:0 0 10px">' + text + '</p><button class="btn sm" data-a="tieplan">' + cta + '</button></div>'; }

  /* ---- Keyword (word game) ---- */
  const WORDS = [['YIELD', 'What your money earns, shown as a yearly percent.'], ['SAVER', 'You, every time you pay yourself first.'], ['RATES', 'Savings rates are variable; CD rates are locked until maturity.'], ['TERMS', 'The rules of an account: rate, length and penalties.'], ['FUNDS', 'Money available to use. "Available funds" may differ from your balance.'], ['ASSET', 'Something you own that holds value, like savings.'], ['VAULT', 'Where banks once kept cash. Today, your goal jar.'], ['DEBIT', 'Money leaving your account.'], ['BONDS', 'Loans you make to a government or company for interest.'], ['MONEY', 'The thing this whole game is about.'], ['GOALS', 'Named targets make saving easier to stick with.'], ['LOANS', 'Money you borrow and pay back with interest.']];
  const WORD = WORDS[DAYNUM % WORDS.length];
  function kwEval(g) {
    const a = WORD[0].split(''), res = Array(5).fill('a'), left = {};
    a.forEach((ch, i) => { if (g[i] === ch) res[i] = 'c'; else left[ch] = (left[ch] || 0) + 1; });
    g.split('').forEach((ch, i) => { if (res[i] !== 'c' && left[ch]) { res[i] = 'p'; left[ch]--; } });
    return res;
  }
  function keyword() {
    const st = day().keyword || { guesses: [] }, done = st.done;
    const rows = []; const keys = {};
    for (let r = 0; r < 6; r++) {
      const g = st.guesses[r];
      if (g) { const ev = kwEval(g); g.split('').forEach((ch, i) => { const rank = { c: 3, p: 2, a: 1 }; if (!keys[ch] || rank[ev[i]] > rank[keys[ch]]) keys[ch] = ev[i]; }); rows.push('<div class="kw-row">' + g.split('').map((ch, i) => '<div class="kw-cell ' + ev[i] + '">' + ch + '</div>').join('') + '</div>'); }
      else if (r === st.guesses.length && !done) rows.push('<div class="kw-row" id="kwcur">' + [0, 1, 2, 3, 4].map(i => '<div class="kw-cell' + (ui.kw[i] ? ' f' : '') + '">' + (ui.kw[i] || '') + '</div>').join('') + '</div>');
      else rows.push('<div class="kw-row">' + '<div class="kw-cell"></div>'.repeat(5) + '</div>');
    }
    let body = '<div class="kw-grid" aria-live="polite">' + rows.join('') + '</div>';
    if (done) {
      body += '<div class="card pop"><h2>' + (st.won ? 'Got it in ' + st.guesses.length + '! 🎉' : 'The word was ' + WORD[0]) + '</h2><p><b>' + WORD[0] + ':</b> ' + WORD[1] + '</p><button class="btn sm ghost" data-a="share">Share result</button></div>' +
        tieIn('Words become habits. MyKey turns "' + WORD[0].toLowerCase() + '" into a plan for your money.', 'Open my plan');
    } else {
      const kb = ['QWERTYUIOP', 'ASDFGHJKL', '>ZXCVBNM<'];
      body += '<div class="kb">' + kb.map(r => '<div>' + r.split('').map(ch => ch === '>' ? '<button class="wide" data-a="kw" data-v="ENTER">ENTER</button>' : ch === '<' ? '<button class="wide" data-a="kw" data-v="DEL" aria-label="Delete">⌫</button>' : '<button class="' + (keys[ch] || '') + '" data-a="kw" data-v="' + ch + '">' + ch + '</button>').join('') + '</div>').join('') + '</div>';
    }
    return gameShell('keyword', body);
  }
  function kwKey(k) {
    const st = day().keyword = day().keyword || { guesses: [] };
    if (st.done) return;
    if (k === 'DEL') ui.kw = ui.kw.slice(0, -1);
    else if (k === 'ENTER') {
      if (ui.kw.length < 5) { const r = $('kwcur'); if (r) { r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); } toast('Not enough letters'); return; }
      st.guesses.push(ui.kw); ui.kw = '';
      const won = st.guesses[st.guesses.length - 1] === WORD[0];
      if (won || st.guesses.length === 6) { finishGame('keyword', { guesses: st.guesses, won, label: won ? st.guesses.length + '/6' : 'X/6' }); if (won && st.guesses.length <= 3) badge('kw3'); }
      save();
    } else if (/^[A-Z]$/.test(k) && ui.kw.length < 5) ui.kw += k;
    render();
  }

  /* ---- Deep Save (dive quiz) ---- */
  const QS = [
    ['A 12-month CD at 4% on $5,000 earns about how much in a year?', ['$20', '$200', '$400', '$2,000'], 1, '5,000 × 4% = $200.'],
    ['What usually happens if you take money out of a CD early?', ['Nothing', 'You pay a penalty', 'Your rate goes up', 'You get a bonus'], 1, 'Most CDs charge a set number of days of interest.'],
    ['An emergency fund is often how many months of expenses?', ['One week', '3 to 6 months', '5 years', 'None needed'], 1, 'Three to six months is a common starting target.'],
    ['A "teaser" rate is…', ['A rate that lasts forever', 'A high intro rate that drops later', 'A monthly fee', 'A type of loan'], 1, 'Always ask what the rate becomes after the promo.'],
    ['A CD ladder helps you…', ['Get money back at regular intervals', 'Avoid all interest', 'Borrow more', 'Skip taxes'], 0, 'Staggered terms mean part of your money matures every few months.'],
    ['With uneven income, saving a percent of each deposit…', ['Saves the same dollars every month', 'Saves more in big months, less in slow ones', 'Stops all saving', 'Costs a fee'], 1, 'Percent-based saving flexes with your income.'],
    ['FDIC insurance covers deposits up to how much per depositor, per bank, per ownership category?', ['$25,000', '$100,000', '$250,000', 'Unlimited'], 2, 'The standard limit is $250,000.'],
    ['Moving $6,000 from 3.25% to 4.10% earns about how much more per year?', ['$5', '$51', '$510', '$5,100'], 1, '6,000 × 0.85% ≈ $51.'],
    ['A CD "grace period" is…', ['A short window after maturity to change or withdraw', 'A late fee', 'A bonus rate', 'A loan term'], 0, 'Your CD terms say how long yours lasts.'],
    ['"APY" includes the effect of…', ['Compounding', 'Taxes', 'Inflation', 'ATM fees'], 0, 'APY reflects interest earning interest over a year.'],
    ['Paying yourself a "steady salary" from uneven income means…', ['Spending whatever comes in', 'Same transfer each month, a cushion absorbs swings', 'Never saving', 'Only saving in December'], 1, 'Big months fill the cushion; slow months draw from it.']
  ];
  const ZONES = [[0, 'Checking shallows'], [150, 'Savings reef'], [300, 'CD canyon'], [450, 'Ladder trench'], [600, 'Vault floor']];
  function diveStart() { ui.dive = { qs: shuffle(QS.map((q, i) => i), DAYNUM).slice(0, 7), i: 0, score: 0, left: 20, picked: null }; startTick(); }
  function startTick() {
    stopTick();
    ui.tick = setInterval(() => {
      const d = ui.dive; if (!d || d.picked !== null) return;
      d.left--; const t = $('tbar'), s = $('tsec');
      if (t) t.style.width = (d.left / 20 * 100) + '%'; if (s) s.textContent = d.left + 's';
      if (d.left <= 0) { d.picked = -1; render(); }
    }, 1000);
  }
  function stopTick() { if (ui.tick) clearInterval(ui.tick); ui.tick = null; }
  function dive() {
    const done = day().dive;
    const depth = done ? done.score : ui.dive ? ui.dive.score : 0;
    const ocean = '<div class="ocean" aria-label="Depth ' + depth + ' meters">' + ZONES.map(([z, n]) => '<div class="z" style="top:' + (6 + z / 700 * 88) + '%">' + n + '</div>').join('') + '<div class="diver" style="top:' + (6 + depth / 700 * 88) + '%">🤿</div></div>';
    let right;
    if (done) right = '<div class="big">' + done.score + ' m</div><p class="muted small">' + zoneName(done.score) + '</p><p class="small">' + done.correct + ' of 7 correct.</p><button class="btn sm ghost" data-a="share">Share</button>';
    else if (!ui.dive) right = '<h2>Ready to dive?</h2><p class="small muted">7 questions, 20 seconds each. Faster right answers sink you deeper. 700 m is the vault floor.</p><button class="btn" data-a="divego">Start dive</button>';
    else {
      const d = ui.dive, q = QS[d.qs[d.i]];
      right = '<div class="between small"><b>Q' + (d.i + 1) + ' of 7</b><span id="tsec">' + d.left + 's</span></div><div class="timer"><i id="tbar" style="width:' + (d.left / 20 * 100) + '%"></i></div><p style="font-weight:700;font-size:15px">' + q[0] + '</p>' +
        q[1].map((o, i) => '<button class="qopt' + (d.picked !== null ? (i === q[2] ? ' right' : i === d.picked ? ' wrong' : '') : '') + '" data-a="divepick" data-v="' + i + '"' + (d.picked !== null ? ' disabled' : '') + '>' + o + '</button>').join('') +
        (d.picked !== null ? '<p class="small">' + (d.picked === -1 ? '⏱ Time\'s up. ' : d.picked === q[2] ? '✅ ' : '❌ ') + q[3] + '</p><button class="btn sm" data-a="divenext">' + (d.i < 6 ? 'Next' : 'Surface') + '</button>' : '');
    }
    return gameShell('dive', '<div class="dive">' + ocean + '<div>' + right + '</div></div>' + (done ? tieIn('Every answer here is a real feature in your plan: reserves, ladders, percent saving.', 'See my plan') : ''));
  }
  const zoneName = s => ZONES.filter(z => s >= z[0]).pop()[1];

  /* ---- Rate or Hype ---- */
  const OFFERS = [
    ['5.25% APY!*', '*for 3 months, then 3.00%', false, 'Blended over a year that is about 3.56%. On $6,000: about $214, less than a steady 4% ($240).'],
    ['4.10% APY savings', 'No minimum, FDIC insured', true, 'A real gap: about $51 more a year on $6,000. Worth weighing against switching hassle.'],
    ['$300 bonus', 'Move $15,000 and keep it 90 days', false, 'With $6,000 you would not qualify. Hype for you, maybe great for someone else.'],
    ['6.00% APY', 'On your first $500 only', false, 'Max $30 a year. Everything above $500 earns much less.'],
    ['Round-ups to savings', 'Spare change from every purchase', true, 'Small but automatic, often $25 to $40 a month. Habits beat rate-chasing.']
  ];
  function rate() {
    const done = day().rate, s = ui.rh || (ui.rh = { i: 0, right: 0, ans: null });
    if (done) return gameShell('rate', '<div class="card pop" style="text-align:center"><div class="big">' + done.right + '/5</div><p>' + (done.right === 5 ? 'Perfect. No hype gets past you.' : 'Nice. Teaser rates are tricky.') + '</p><button class="btn sm ghost" data-a="share">Share</button></div>' + tieIn('Run the same math on your own savings with the Rate Reality Check.', 'Open Rate Reality Check'));
    const o = OFFERS[s.i];
    return gameShell('rate', '<div class="between small"><b>Offer ' + (s.i + 1) + ' of 5</b><span>' + s.right + ' right</span></div>' +
      '<div class="offer"><div class="kicker">Spotted online</div><div class="ad">' + o[0] + '</div><div class="muted small">' + o[1] + '</div>' +
      (s.ans !== null ? '<p class="small" style="margin-top:14px">' + (s.ans === o[2] ? '✅ ' : '❌ ') + '<b>' + (o[2] ? 'Worth it.' : 'Hype.') + '</b> ' + o[3] + '</p>' : '') + '</div>' +
      (s.ans === null ? '<div class="two"><button class="btn ghost" data-a="rh" data-v="0">Hype</button><button class="btn" data-a="rh" data-v="1">Worth it</button></div>' : '<button class="btn" data-a="rhnext">' + (s.i < 4 ? 'Next offer' : 'See score') + '</button>'));
  }

  /* ---- Ladder Up ---- */
  const LRATES = { 3: 3.0, 6: 3.4, 9: 3.7, 12: 4.0, 18: 4.2 }; // game-only rates
  const NEEDS = [3, 6, 9, 12];
  function ladderScore(picks) {
    return picks.map((t, i) => {
      const need = NEEDS[i], r = LRATES[t] / 100;
      if (t > need) return { ok: false, v: 3000 * r * need / 12 - 3000 * r * R.penaltyDays / 365 };
      return { ok: true, v: 3000 * r * t / 12 };
    });
  }
  function ladder() {
    const done = day().ladder, picks = (ui.lad = ui.lad || [0, 0, 0, 0]);
    const best = ladderScore(NEEDS).reduce((a, b) => a + b.v, 0);
    let body = '<div class="card"><p class="small" style="margin:0">Michael has <b>$12,000</b> and needs <b>$3,000</b> for repairs every 3 months. Pick a term for each chunk. Longer terms pay more, but if it is still locked when the bill comes, you pay a penalty.</p></div>';
    const res = done ? ladderScore(done.picks) : null;
    body += NEEDS.map((n, i) => '<div class="rung"><div class="between"><b>$3,000 needed in month ' + n + '</b>' + (res ? (res[i].ok ? '<span class="chip ok">+' + usd.format(res[i].v.toFixed(0)) + '</span>' : '<span class="chip warn">Penalty</span>') : '') + '</div><div class="terms">' +
      Object.keys(LRATES).map(t => '<button class="' + (((done ? done.picks : picks)[i] == t) ? (res && !res[i].ok ? 'on bad' : 'on') : '') + '" data-a="lad" data-i="' + i + '" data-v="' + t + '"' + (done ? ' disabled' : '') + '>' + t + 'mo</button>').join('') + '</div></div>').join('');
    if (done) {
      body += '<div class="card pop" style="text-align:center"><div class="big">' + '⭐'.repeat(done.stars) + '</div><p>Earned ' + m(done.total) + ' of a possible ' + m(best) + '.</p><p class="small muted">The trick: match each term to when you need the money. That is a CD ladder.</p><button class="btn sm ghost" data-a="share">Share</button></div>' + tieIn('Michael\'s real CD matures in 14 days. Build his split in the Savings Checkup.', 'Open Savings Checkup');
    } else body += '<button class="btn" data-a="ladgo"' + (picks.every(Boolean) ? '' : ' disabled') + '>Check my ladder</button><p class="note">Game rates for practice only.</p>';
    return gameShell('ladder', body);
  }

  /* ---- Lean Month ---- */
  const LEAN_BILLS = 3400;
  function leanIncomes() { return shuffle(P.variable.income, DAYNUM + 7).map((x, i) => Math.round((x + (rng(DAYNUM + i)() - 0.5) * 600) / 50) * 50); }
  function lean() {
    const done = day().lean, inc = leanIncomes(), s = ui.lm || (ui.lm = { m: 0, cushion: 400, saved: 0, od: 0, log: [] });
    if (done) return gameShell('lean', '<div class="card pop" style="text-align:center"><div class="big">' + '⭐'.repeat(done.stars) + '</div><p>Saved <b>' + m(done.saved) + '</b> with ' + done.od + ' overdraft' + (done.od === 1 ? '' : 's') + '.</p><p class="small muted">Best strategy: save big in strong months, skip saving in slow ones. Percent Saver with Lean-month mode does it for you.</p><button class="btn sm ghost" data-a="share">Share</button></div>' + tieIn('Sam can automate this with Steady Pay and Percent Saver.', 'Set up Steady Pay'));
    const x = inc[s.m];
    return gameShell('lean', '<div class="stat2"><div><b>' + m(s.cushion) + '</b><span>cushion (checking)</span></div><div><b>' + m(s.saved) + '</b><span>saved</span></div></div>' +
      '<div class="card"><div class="kicker">Month ' + (s.m + 1) + ' of 6</div><div class="big" style="margin:6px 0">' + m(x) + '</div><p class="small muted">came in this month. Bills are ' + m(LEAN_BILLS) + '. Overdrafts cost $35.</p>' +
      '<p style="font-weight:700;margin-bottom:8px">How much do you save?</p><div class="opts">' + [20, 10, 0].map(p => '<button class="opt" data-a="lm" data-v="' + p + '"><span><b>Save ' + p + '%</b><small>' + m(x * p / 100) + ' to savings</small></span></button>').join('') + '</div></div>' +
      (s.log.length ? '<p class="small muted">' + s.log.join(' · ') + '</p>' : ''));
  }

  /* ================= me + sheets ================= */
  function meScreen() {
    const pr = S.prefs;
    const sw = (k, t, d) => '<div class="toggle"><div><b class="small">' + t + '</b><p>' + d + '</p></div><span class="sw"><input type="checkbox" data-pref="' + k + '"' + (pr[k] ? ' checked' : '') + ' aria-label="' + t + '"><span></span></span></div>';
    return '<div class="main" id="main"><div class="kicker">Me</div><h1 class="hi">' + me().name + ', ' + me().age + '</h1><p class="muted small">' + me().label + ' · ' + me().job + '</p>' +
      '<h3>Switch customer</h3>' + Object.values(P).map(p => '<button class="persona' + (p.id === S.persona ? ' on' : '') + '" data-a="persona" data-v="' + p.id + '"><span class="av">' + p.emoji + '</span><span><b>' + p.name + ' · ' + p.label + '</b><small>' + p.problem + '</small></span></button>').join('') +
      '<div class="card"><h3>Privacy</h3>' + sw('tips', 'Personal tips from MyKey', 'Suggestions based on your goals and balances.') + sw('activity', 'Use recent activity', 'Let MyKey consider transfers and deposits. Off means balances and goals only.') + sw('remind', 'Daily game reminder', 'One gentle nudge a day. Never about your balance.') + '</div>' +
      '<div class="card"><h3>About this prototype</h3><p class="small">A concept for the MyKey assistant inside the KeyBank app, built for a student case competition. Answers are scripted, customers are fictional, and rates are illustrative.</p>' +
      '<a class="btn sm ghost" href="../index.html">Desktop prototype + banker console</a> <button class="btn sm ghost" data-a="reset" style="margin-top:8px">Reset demo</button></div></div>';
  }
  function sheet() {
    if (!ui.sheet) return '';
    let h = '';
    if (ui.sheet === 'about') h = '<div class="kicker">Prototype</div><h2>Built into MyKey</h2><p>This is a concept of how the <b>MyKey assistant</b> in the KeyBank app could help three kinds of savers:</p><ul class="list"><li><b>🚀</b>Young professionals tempted by digital banks</li><li><b>🏡</b>Established savers with a CD maturing</li><li><b>🚗</b>People with variable income</li></ul><p class="small muted" style="margin-top:10px">Student case competition demo. Fictional data, scripted answers, illustrative rates. Not operated by or affiliated with KeyBank.</p><button class="btn" data-a="closesheet">Got it</button>';
    if (ui.sheet === 'banker') h = '<div class="kicker">Banker request</div><h2>A banker will reach out</h2><p class="small">They will see your plan and your MyKey chat, so you will not have to start over.</p><div class="opts">' + ['Call me today', 'Video tomorrow', 'Branch visit this week'].map(o => '<button class="opt" data-a="bankerpick" data-v="' + o + '"><span><b>' + o + '</b></span></button>').join('') + '</div><p class="note">Prototype: no request is actually sent.</p>';
    return '<div class="scrim" data-a="closesheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + h + '</div>';
  }

  /* ================= render ================= */
  function render(keepScroll) {
    const app = $('app'), old = $('main'), y = keepScroll && old ? old.scrollTop : 0;
    const focus = document.activeElement && document.activeElement.id;
    let body;
    if (!S.persona) body = onboarding();
    else if (ui.game) body = ({ keyword, dive, rate, ladder, lean })[ui.game]();
    else body = ({ home, plan: planScreen, play: playHub, me: meScreen })[S.tab]();
    app.innerHTML = header() + body + (S.persona ? tabbar() : '') + sheet();
    const main = $('main');
    if (main) main.scrollTop = keepScroll === 'bottom' ? main.scrollHeight : y;
    if (focus && $(focus)) $(focus).focus({ preventScroll: true });
  }
  function liveUpdate() {
    const o = outs();
    document.querySelectorAll('[data-out]').forEach(el => { if (o[el.dataset.out] != null) el.innerHTML = o[el.dataset.out]; });
  }

  /* ================= events ================= */
  const A = {
    persona: v => { S.persona = v; S.tab = 'home'; ui.game = null; save(); render(); },
    tab: v => { stopTick(); ui.game = null; S.tab = v; save(); render(); },
    sheet: v => { ui.sheet = v; render(true); },
    closesheet: () => { ui.sheet = null; render(true); },
    chip: (v, el) => { ask(el.textContent); render('bottom'); },
    banker: () => { ui.sheet = 'banker'; render(true); },
    bankerpick: v => { ui.sheet = null; const c = S.chats[S.persona] = S.chats[S.persona] || []; c.push({ t: 'Done. A banker will reach out: ' + v.toLowerCase() + '. They can see your plan.' }); save(); render(S.tab === 'home' ? 'bottom' : true); toast('Banker request noted (prototype)'); },
    choice: v => { S.plans.established.choice = v; save(); render(true); },
    jar: v => { S.plans.young.jar = v; S.plans.young.started = false; save(); render(true); },
    review: () => { S.plans.established.review = true; save(); render(true); toast('Rate review requested (prototype)'); },
    lock: () => { const p = S.plans.established, o = estOptions().find(x => x.id === p.choice); p.locked = true; badge('plan'); (S.chats.established = S.chats.established || []).push({ t: 'Your plan is saved: ' + m(p.reserve) + ' stays accessible and ' + m(10000 - p.reserve) + ' goes to ' + o.name.toLowerCase() + '. You can change it until ' + matDate(14) + '.' }); save(); render(true); toast('Plan locked in. Details in MyKey chat.'); },
    start: () => { plan().started = true; badge('plan'); save(); render(true); toast(S.persona === 'young' ? 'Goal Jar started (prototype)' : 'Steady Pay turned on (prototype)'); },
    game: v => { ui.game = v; ui.kw = ''; if (v === 'dive' && !day().dive) ui.dive = null; render(); },
    exitgame: () => { stopTick(); ui.game = null; S.tab = 'play'; render(); },
    tieplan: () => { stopTick(); ui.game = null; S.tab = 'plan'; render(); },
    kw: v => kwKey(v),
    divego: () => { diveStart(); render(true); },
    divepick: v => { const d = ui.dive; if (d.picked !== null) return; d.picked = Number(v); if (d.picked === QS[d.qs[d.i]][2]) { d.score += 50 + Math.round(d.left * 2.5); d.correct = (d.correct || 0) + 1; } render(true); },
    divenext: () => {
      const d = ui.dive;
      if (d.i < 6) { d.i++; d.picked = null; d.left = 20; startTick(); render(true); return; }
      stopTick(); finishGame('dive', { score: d.score, correct: d.correct || 0, label: d.score + ' m' }); if (d.score >= 450) badge('deep'); ui.dive = null; render();
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
      let note = 'M' + (s.m + 1) + ': ' + v + '%';
      if (s.cushion < 0) { s.od++; s.cushion -= 35; note += ' ⚠️'; }
      s.log.push(note); s.m++;
      if (s.m === 6) { const stars = s.od === 0 && s.saved >= 1800 ? 3 : s.od === 0 ? 2 : 1; finishGame('lean', { saved: s.saved, od: s.od, stars, label: '⭐'.repeat(stars) }); if (!s.od) badge('lean'); ui.lm = null; }
      render(true);
    },
    share: () => {
      const d = day(), g = ui.game, r = d[g]; let txt = 'MyKey ' + GAMES[g].name + ' ' + TODAY + ': ' + (r.label || 'done');
      if (g === 'keyword') txt += '\n' + r.guesses.map(w => kwEval(w).map(e => ({ c: '🟩', p: '🟨', a: '⬜' }[e])).join('')).join('\n');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Result copied'), () => toast(txt)); else toast(txt);
    },
    reset: () => { if (!confirm('Reset the demo? Plans, chats, games and badges clear.')) return; stopTick(); S = fresh(); ui.game = null; save(); render(); }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el || !A[el.dataset.a] || el.disabled) return;
    if (el.tagName === 'A') return;
    e.preventDefault(); A[el.dataset.a](el.dataset.v, el);
  });
  document.addEventListener('submit', e => {
    if (e.target.dataset.f !== 'ask') return; e.preventDefault();
    const q = e.target.q.value.trim(); if (!q) return; ask(q); render('bottom'); const i = $('q'); if (i) i.focus({ preventScroll: true });
  });
  document.addEventListener('input', e => { const t = e.target; if (t.dataset.r) { plan()[t.dataset.r] = Number(t.value); save(); liveUpdate(); } });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.pt) { plan()[t.dataset.pt] = t.checked; save(); liveUpdate(); }
    if (t.dataset.pref) { S.prefs[t.dataset.pref] = t.checked; save(); toast('Saved'); }
  });
  document.addEventListener('keydown', e => {
    if (ui.game === 'keyword' && !e.metaKey && !e.ctrlKey) {
      if (e.key === 'Enter') { e.preventDefault(); kwKey('ENTER'); } else if (e.key === 'Backspace') kwKey('DEL'); else if (/^[a-z]$/i.test(e.key)) kwKey(e.key.toUpperCase());
    }
    if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(true); }
  });

  render();

  /* QR code for judges (desktop panel only) */
  function qr() {
    const url = location.href.split('#')[0].split('?')[0];
    $('qrurl').textContent = url.replace(/^https?:\/\//, '');
    if (window.QRCode) new window.QRCode($('qr'), { text: url, width: 240, height: 240, correctLevel: window.QRCode.CorrectLevel.M });
  }
  if (window.QRCode) qr(); else window.addEventListener('load', qr);
})();
