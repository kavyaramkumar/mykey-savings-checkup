'use strict';
/* Seed data for the demo. Everything here is fictional. Rates are illustrative placeholders an admin can edit, not KeyBank offers. */
window.SEED = {
  version: 3,
  session: null,
  rules: {
    windowDays: 30,       // CD maturing within this many days
    wMaturity: 30,        // points for maturing inside the window
    transfersMin: 2,      // external transfers in last 30 days to count as a signal
    wTransfers: 50,       // points for repeated external transfers
    largeBalance: 25000,  // CD balance considered large
    wLarge: 10,
    newTenureYears: 2,    // customer tenure below this is "newer relationship"
    wTenure: 10,
    threshold: 60         // review personalized outreach at or above this score, with consent
  },
  rates: {
    savings: 3.25,        // illustrative APY for an accessible savings account
    cd6: 3.90,
    cd12: 3.75,
    cd18: 3.55,
    noPenalty: 3.40,      // illustrative flexible CD
    penaltyDays: 90       // illustrative early-withdrawal penalty in days of interest
  },
  pilot: {
    customers: 2000,
    maturing: 40000000,
    controlRate: 69,
    treatRate: 74,
    spread: 1.5,          // value of retained deposits vs. replacement funding, % per year
    costPerCustomer: 6,
    platformCost: 60000
  },
  content: {},            // intent -> approved replacement answer
  reviews: [
    { id: 'r-seed', intent: 'early', question: 'What if I need it early?', answer: 'An early CD withdrawal may carry a penalty. See the CD terms.', reason: 'Customer said the penalty explanation was too vague.', profile: 'Jordan Lee', status: 'pending', proposed: 'If you withdraw before maturity, the penalty is usually a set number of days of interest, so the cost depends on your rate and how much you take out. Your CD terms list the exact penalty. If you may need money before maturity, keep that amount in accessible savings.', at: Date.now() - 86400000 }
  ],
  appointments: [],
  audit: [],
  profiles: [
    {
      id: 'michael', userId: 'michael.demo', name: 'Michael Turner', initials: 'MT',
      segment: 'Homeowner, mid-career', tenureYears: 6,
      goal: 'Home repairs', goalAmount: 3000, needMonths: 3,
      checking: 4280, savings: 1150,
      cd: { amount: 10000, apy: 4.60, termMonths: 12, maturesInDays: 14, number: '4417' },
      transfers: [
        { daysAgo: 3, amount: 1500, to: 'External bank ••88' },
        { daysAgo: 11, amount: 1200, to: 'External bank ••88' },
        { daysAgo: 19, amount: 900, to: 'External bank ••88' }
      ],
      prefs: { personalized: true, insights: true, app: true, email: true, sms: false, leadDays: 14, detail: 'plain' },
      goalConfirmed: false, plan: null, inbox: [], chat: [], notes: ''
    },
    {
      id: 'jordan', userId: 'jordan.demo', name: 'Jordan Lee', initials: 'JL',
      segment: 'Early career renter', tenureYears: 3,
      goal: 'Emergency savings', goalAmount: 5000, needMonths: 6,
      checking: 2650, savings: 800,
      cd: { amount: 10000, apy: 4.50, termMonths: 12, maturesInDays: 14, number: '2290' },
      transfers: [],
      prefs: { personalized: true, insights: true, app: true, email: false, sms: false, leadDays: 14, detail: 'plain' },
      goalConfirmed: false, plan: null, inbox: [], chat: [], notes: ''
    },
    {
      id: 'priya', userId: 'priya.demo', name: 'Priya Shah', initials: 'PS',
      segment: 'Recently retired', tenureYears: 18,
      goal: 'Monthly retirement income', goalAmount: 12000, needMonths: 12,
      checking: 9100, savings: 22400,
      cd: { amount: 45000, apy: 4.75, termMonths: 18, maturesInDays: 26, number: '7781' },
      transfers: [
        { daysAgo: 6, amount: 5000, to: 'External brokerage ••12' },
        { daysAgo: 21, amount: 5000, to: 'External brokerage ••12' }
      ],
      prefs: { personalized: true, insights: true, app: true, email: true, sms: true, leadDays: 30, detail: 'detailed' },
      goalConfirmed: true, plan: null, inbox: [], chat: [], notes: 'Prefers a phone call before any change.'
    },
    {
      id: 'sam', userId: 'sam.demo', name: 'Sam Rivera', initials: 'SR',
      segment: 'Gig worker, newer customer', tenureYears: 1,
      goal: 'Car replacement', goalAmount: 6000, needMonths: 6,
      checking: 1320, savings: 300,
      cd: { amount: 8000, apy: 4.40, termMonths: 6, maturesInDays: 9, number: '5530' },
      transfers: [
        { daysAgo: 2, amount: 700, to: 'External bank ••41' },
        { daysAgo: 9, amount: 650, to: 'External bank ••41' },
        { daysAgo: 16, amount: 800, to: 'External bank ••41' },
        { daysAgo: 24, amount: 500, to: 'External bank ••41' }
      ],
      prefs: { personalized: false, insights: false, app: true, email: false, sms: false, leadDays: 7, detail: 'plain' },
      goalConfirmed: false, plan: null, inbox: [], chat: [], notes: ''
    }
  ]
};
