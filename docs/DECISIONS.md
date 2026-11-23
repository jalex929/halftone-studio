# Decisions

Labels: **Jay's** (Jay decided), **Proposed, approved** (I proposed, Jay agreed),
**Build default** (my call while building; easy to change).

| #   | Date       | Decision                                                                                                                                                                             | Label                                |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| D1  | 2026-11-22 | Start Halftone Studio as the lab's sketch alongside Beam Me Up (the active full app).                                                                                                | Proposed, approved                   |
| D2  | 2026-11-22 | Main tool is a marker-driven 3D dot ribbon, modeled on the Career Capital site banners. Markers set where it stretches and peaks; creative control without complexity.               | Jay's                                |
| D3  | 2026-11-22 | Goal is high-quality true halftones: dots stay separate dots. Each dot is capped by the real on-screen distance to its neighbors (Max fill).                                         | Jay's (goal), build default (method) |
| D4  | 2026-11-22 | Columns are spaced by arc length along the path, and the cross-section turns with the path direction, so steep climbs don't stretch or shear the mesh.                               | Build default                        |
| D5  | 2026-11-22 | Path through markers uses monotone cubic interpolation, so a raised marker is exactly the peak.                                                                                      | Build default                        |
| D6  | 2026-11-22 | Own repo `~/halftone-studio`, same tooling as Quick Chess (Vite, React, TS, Vitest), MIT license file, GitHub no-reply email. Private on GitHub until Jay chooses to make it public. | Build default                        |
| D7  | 2026-11-22 | The flat-pattern engine (`src/engine/field.ts`, `halftone.ts`, `render.ts`, `settings.ts`) is kept but not wired into the UI yet: a possible second mode.                            | Build default                        |
