# Confucian Café Dialogue Orchestrator – Test Plan

This document enumerates the validation strategy for the Confucian Café front end. It covers local development checks, automated scripts, exploratory exercises, and regression suites tied to the dialogue orchestration features.

## 1. Objectives
- Verify that moderators can run complete multi-philosopher sessions without UI or state errors.
- Ensure auto-response scheduling behaves deterministically (per-recipient queues, deduplication, inspector snapshots).
- Guard against regressions in prompt assembly, memory handling, and backend integration.
- Confirm UX essentials: topic display, roster controls, and error surface handling when the backend is unavailable.

## 2. Test Environment
| Component | Version | Notes |
|-----------|---------|-------|
| Node.js   | ≥ 20.x  | Matches README requirement |
| npm       | ≥ 10.x  | Included with Node 20 distribution |
| Browser   | Latest Chrome, Firefox | Validate CSS layout + fetch behaviour |
| Backend   | NabokovsWeb (optional) | Running at `http://localhost:3100`; omit for offline fallback tests |

Launch commands:
```bash
npm install
npm run dev        # dev server with proxy
npm run build      # type-check + production build
```

## 3. Test Matrix

### 3.1 Build & Static Analysis
| ID | Description | Steps | Expected |
|----|-------------|-------|----------|
| B1 | TypeScript build | `npm run build` | No TS errors, bundle emitted |
| B2 | ESLint pass | `npm run lint` | No lint failures |
| B3 | Prettier formatting (spot check) | `npm run format -- --check` (optional) | No unexpected diffs |

### 3.2 UI Smoke Tests (Manual)
| ID | Area | Steps | Expected |
|----|------|-------|----------|
| U1 | Initial render | Open `http://localhost:5173`; verify header, roster, dialogue board placeholders | No console errors, event feed shows initialization |
| U2 | Moderator prompt | Submit prompt to Confucius & Laozi | Message appears with correct recipients; queues increment |
| U3 | Auto-response | Wait for auto replies | Each philosopher responds once; reasoning shows if enabled |
| U4 | Inspector drawer | Open inspector; inspect latest snapshot | Snapshot includes prompt XML, context messages |
| U5 | Topic display | Change topic (when UI added) | Dialogue header displays new topic |
| U6 | Add participant | Use Add participant form for new philosopher | Roster updates; queue count zero |
| U7 | Toggle insights | Use “Show reasoning” toggle | Reasoning panel hides/shows inline |

### 3.3 Backend Interaction
| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| A1 | Healthy backend | Start NabokovsWeb backend; trigger prompt | Inspector shows model reply, event feed logs backend route |
| A2 | Backend offline | Stop backend, reload UI, send prompt | Event feed logs backend error and UI remains responsive |
| A3 | Slow backend | Simulate latency (e.g., throttle network) | Queue indicator remains accurate, UI shows routing message |

### 3.4 Memory & Queue Behaviour
| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| Q1 | Duplicate prevention | Send identical prompt twice quickly | `processedMessagesRef` blocks duplicate auto-queueing |
| Q2 | Queue depth update | Trigger multiple recipients | Queue counts increment/decrement accurately |
| Q3 | Pause auto-responses | Toggle pause button, send prompt | Queue retains tasks; resumes when unpaused |
| Q4 | Snapshot history | Inspect snapshot after multiple rounds | Context includes trimmed history limited by memory max |

### 3.5 Layout & Accessibility
| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| L1 | Responsive layout | Resize viewport (320px – 1440px) | Sidebar and dialogue stack gracefully; no horizontal scroll |
| L2 | Keyboard nav | Tab through controls and buttons | Focus outlines visible; key actions reachable |
| L3 | Color contrast | Use dev tools to check color contrast | Meets WCAG AA for text/button combinations |

### 3.6 Regression Anchors
Re-run the following after major refactors:
1. B1–B3 (build/lint) – automated gate.
2. U1–U4 – minimal smoke test.
3. A1/A2 – ensures proxy + error handling intact.
4. Q1/Q3 – verifies queue management.

## 4. Test Data
- Seeded personas: defined in `src/data/mockData.ts` (Confucius, Laozi, Mozi, Mencius, Xunzi).
- Mock conversation: `mockMessages` array used for offline transcript.
- Add-participant: use unique slugs (`zengzi`, `sunzi`) to avoid ID collisions.

## 5. Tooling & Automation Opportunities
- Integrate Playwright or Cypress for U1–U4 coverage (future work).
- Hook `npm run build` and `npm run lint` into CI for every push.
- Consider snapshot tests for prompt assembly to detect template drift.

## 6. Reporting
During manual runs, capture issues in tracker with:
- Scenario ID
- Steps to reproduce
- Console/network logs
- Screenshot or GIF (for visual issues)

## 7. Sign-off Criteria
Release candidates should satisfy:
- All Build & Static Analysis tests passing.
- UI Smoke Tests U1–U4 verified on latest Chrome and Firefox.
- Backend Interaction A1/A2 confirmed (or documented if backend intentionally offline).
- No critical open bugs impacting dialogue flow, inspector accuracy, or queue handling.

This plan should be revisited whenever the dialogue scheduler or component hierarchy undergo significant changes.
