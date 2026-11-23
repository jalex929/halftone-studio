# Working in halftone-studio

Read `README.md` and `docs/DECISIONS.md` first; add a row to DECISIONS.md for every new call.

- The goal is true, high-fidelity halftones: dots must stay dots. Any engine change keeps the
  "never outgrow its room" and "even spacing" tests passing.
- Engine code in `src/engine/` stays pure and tested; UI in `src/ui/` and `src/App.tsx`.
- Left-aligned, strong grid layout. Never show state by color alone; every control reachable
  by keyboard (markers move with arrow keys).
- Before pushing: `npm run check`.
- Commits use the GitHub no-reply email, never a personal address.
