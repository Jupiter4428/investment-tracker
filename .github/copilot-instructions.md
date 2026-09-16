# Investment Tracker v2: Copilot Working Agreement

This repository uses the working principles from the local `mattpocock_skill` collection. Apply them directly during Copilot sessions; the skills are workflow guidance, not runtime dependencies.

## Before changing code

- Start from the smallest concrete anchor: a failing test, reported behavior, route, service, or UI handler.
- Read the relevant local implementation and nearby tests before editing.
- State one falsifiable hypothesis about the behavior and one focused check that could disprove it.
- For unfamiliar areas, first provide a short zoomed-out map of the data flow, then return to the owning implementation.
- Preserve unrelated user changes. Do not reset, revert, commit, or create branches unless explicitly requested.

## Implementation loop

- Prefer vertical slices: one behavior, one focused test, the smallest implementation, then validation.
- Use behavior-focused tests through public interfaces. Avoid tests coupled to private implementation details.
- After the first substantive edit, run the narrowest available executable check before reading or editing adjacent areas.
- Finish with at least one executable validation step. Report commands that could not be run and why.
- Keep edits minimal and consistent with the existing CommonJS backend and static frontend. Use `apply_patch` for manual edits.

## Smart-DCA v2 invariants

These rules are business requirements from `Smart-DCA-v2-logic-plan.txt` and have priority over scores or indicators:

1. Never auto-sell.
2. `currentWeight >= hardMaxWeight` always means `STOP_BUY` and allocation `0`.
3. `NOT_IN_TARGET` means target weight `0`, hard max `0`, allocation `0`, and no automatic sell.
4. Hard max constraints must be checked during initial allocation and on every redistribution iteration.
5. Total allocation cannot exceed the available budget; unallocated money remains cash.
6. Invalid or missing data produces `REVIEW` according to the existing policy; it must not silently force a buy.
7. RSI, trend, MACD, valuation, and volatility adjust priority only. They cannot override portfolio state or hard rules.
8. Volatility budget multipliers are capped at `1.50x` and cannot bypass hard max or budget caps.
9. Scores are normalized decision signals, never dollar amounts.

## Repository-specific validation

From `investmenttrackerv2/backend`:

```powershell
node --test test/*.test.js
```

For backend changes, also use a focused Node test or route-level request when the full test glob is unavailable. For frontend changes, verify the affected DOM flow in a running static server and check the browser console for errors.

## Useful workflow prompts

Use these prompt styles when the task benefits from a specific `mattpocock_skill` workflow:

- Diagnose: `Reproduce and diagnose this bug. Build a focused feedback loop first.`
- TDD: `Use a red-green-refactor loop for this behavior, one vertical slice at a time.`
- Zoom out: `Give me the data-flow and ownership map for this area before proposing a change.`
- Architecture: `Review this area for deepening opportunities without changing behavior yet.`
- Grill: `Challenge this plan against the existing domain model, terminology, and ADRs.`

The source skill documents live in the sibling `mattpocock_skill` workspace under `skills/engineering/` and `skills/productivity/`.