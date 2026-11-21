# MyKey Savings Checkup

Student prototype for the 2026 KeyBank Symposium case competition. It imagines the MyKey virtual assistant helping customers decide what to do when a CD matures, plus a banker console for retention outreach.

**Not a KeyBank website.** All customers, balances and transactions are fictional. Rates and penalties are illustrative placeholders an admin can edit. For real products and terms, visit [key.com](https://www.key.com/personal/index.html).

## Two prototypes

| | URL | For |
|---|---|---|
| **Prototype 2: mobile, inside MyKey** | `/mobile/` | Judges scanning a QR code on their phones |
| Prototype 1: desktop + banker console | `/` | Walkthrough on the projector, banker-side story |
| QR code page | `/qr.html` | Put on a slide or print it |

### Prototype 2 (mobile)

Pick one of three customers, each with a different problem the product answers:

| Customer | Problem | In the product | Their game |
|---|---|---|---|
| Jordan, young professional | Tempted by a digital bank's higher rate | Rate Reality Check (gap in dollars) + Goal Jars with auto-save, round-ups and a boost rate | Rate or Hype? |
| Michael, established saver | CD maturing, competitors sending offers | Savings Checkup + "Got an offer?" comparison that routes to a banker rate review | Ladder Up |
| Sam, variable income | Uneven income makes saving hard | Steady Pay (same paycheck, cushion absorbs swings) + Percent Saver with Lean-month mode | Lean Month |

Everyone also gets two dailies: **Keyword** (a 5-letter money word in 6 tries) and **Deep Save** (7 timed questions; faster right answers dive deeper). Streaks, badges, share results, and each game ends with one tap into the customer's plan.

## Demo script (prototype 1)

1. **Public site** (`#/`): KeyBank-style homepage introducing the Checkup.
2. **Sign On**: pick a demo profile, type a User ID (e.g. `michael.demo`), or enroll a new one. No passwords anywhere.
3. **Customer side** (`#/app/...`)
   - *Accounts*: balances, recent activity, CD maturity alert, "Why am I seeing this?"
   - *Savings Checkup*: set an accessible reserve, compare renew / ladder / flexible CD / savings / move out, stress-test a surprise expense, lock in a plan, request a banker with context attached.
   - *Ask MyKey*: scripted assistant (penalties, rates, renewal, ladders, privacy, scams). Telling it a goal ("I'm saving for a car") confirms the goal. Any answer can be flagged for review.
   - *Messages*: outreach a banker sends from the console appears here; customer responses flow back.
   - *Privacy & Preferences*: consent switches for personalized outreach and activity insights, channels, reminder lead time, explanation style, a plain view of stored data, delete chat history.
4. **Banker console** (top bar link)
   - *Overview*: maturing dollars, flagged customers, consent rate, and a MECE view of where each maturing dollar is headed (renews into a CD / moves to another KeyBank account / leaves / undecided).
   - *Retention queue*: explainable priority score, consent-aware next step, outreach draft that never cites transactions, send via MyKey.
   - *Profiles*: add, edit, delete, sign in as, export/import JSON, reset demo.
   - *Answer review*: approve revised wording for flagged answers; MyKey uses it immediately.
   - *Banker requests*, *Rules & rates*, *Pilot economics* (lift, incremental retained dollars, funding value, ROI), *Audit log*.

## Demo profiles

| Profile | Shows |
|---|---|
| Michael Turner | High priority: CD due in 14 days plus repeated external transfers |
| Jordan Lee | Low priority: standard maturity notice |
| Priya Shah | Large CD, retiree, detailed explanations, prefers a call |
| Sam Rivera | Consent off: score ignores activity, only the standard notice is allowed |

Data saves in the browser (`localStorage`). Use **Profiles > Export data** to share a set with teammates.

## Run locally

Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8455
```
