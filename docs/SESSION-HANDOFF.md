# Session Handoff

Updated: 2026-10-06

Read this before continuing repository work. Preserve the existing worktree changes; do not reset, checkout, or stage everything indiscriminately.

The OCR slip-scanning feature mentioned in this historical handoff was subsequently removed. Do not resume or restore that feature unless requested.

## Git State

- Before the latest documentation batch, `main` and `origin/main` were at `d939992` (`docs: add session handoff notes`); subsequent documentation commits may leave local `main` ahead of origin until pushed.
- The documentation changes were committed separately by file. Check `git status -sb` and `git log -5 --oneline` before assuming worktree or push state.
- Preserve new user changes; inspect `git status` before editing, staging, or committing.

## Current Behavior and Caveats

- Transactions and stored portfolio prices are interpreted as USD; the database has no per-transaction or per-price currency field.
- The Holdings page refresh flow converts Thai stock prices using a live `THB=X` quote before saving and captures a same-day snapshot when prices change.
- The `/market/quote/:ticker` endpoint returns the market quote in the ticker's native currency. Smart-DCA `fetchLive=true` currently persists indicator prices directly without FX conversion; avoid using this flow to refresh Thai stock prices in the USD-based portfolio until the conversion is fixed.
- Smart-DCA training samples can be downloaded by an owner as JSONL. Their `outcome` is `null`; they are not observed investment results. Transaction import/export is not implemented.
- `backend/.env.example` includes `RSI_OVERSOLD`, `RSI_OVERBOUGHT`, `REBALANCE_TOLERANCE`, and `VOL_DCA_CAP`; runtime currently does not read these variables.
- The OCR slip-scanning feature was removed. Do not restore it unless requested.

## Verification

Run backend tests from `backend/` after code changes:

```powershell
node --test test/*.test.js
```

Documentation edits do not replace this check when backend behavior changes. Verify API and currency statements against the relevant routes and frontend flow.
