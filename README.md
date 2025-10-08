# Confucian Café Dialogue Orchestrator

React + Vite front end for staging deliberations among classical Chinese philosophers. The UI lets a moderator compose prompts, observe auto-generated replies, inspect prompt payloads, and monitor backend health.

## Features
- **Moderator-driven dialogue:** Target any subset of the philosopher roster; each reply records addressees and phase metadata.
- **Auto-response scheduler:** Maintains per-philosopher queues so follow-up prompts trigger new responses without blocking the moderator.
- **Prompt inspector:** Captures the assembled context (persona template + memory slice) and backend payload for each model call.
- **Mock data fallback:** Ships with seeded messages and personas for offline demos when the NabokovsWeb backend is unavailable.

## Getting Started
1. Install Node.js 20 or newer.
2. (Optional) Start the NabokovsWeb backend locally at `http://localhost:3100`.
3. Install dependencies and launch Vite:

   ```bash
   npm install
   npm run dev
   ```

The dev server proxies `/api` and `/health` to the backend so moderator prompts are forwarded automatically when the service is running.

### Additional Scripts
- `npm run build` – Type-check and generate a production bundle.
- `npm run preview` – Serve the bundle from the `dist` output.
- `npm run lint` – Run ESLint on TypeScript/TSX sources.

## Project Layout
```
.
├── docs/                  # Architecture reference and system notes
├── src/
│   ├── App.tsx            # Main layout, state management, queue orchestration
│   ├── data/mockData.ts   # Seeded philosophers, mock dialogue stream, snapshots
│   ├── lib/               # API wrapper, context builder, memory utilities, time helpers
│   ├── styles/app.css     # UI styling and layout tokens
│   ├── types.ts           # Shared TypeScript contracts
│   └── main.tsx           # React entry point
├── index.html             # Vite entry document
├── vite.config.ts         # Vite + proxy configuration
├── tsconfig*.json         # TypeScript configuration
└── eslint.config.js       # Linting rules
```

## Development Notes
- Conversation history is maintained in-memory; refreshing the browser resets the transcript.
- Backend outages surface as warnings in the event feed but do not block moderator input.
- Persona templates can be extended or new philosophers added via the “Add participant” form in the roster controls.

## Documentation
- Architecture overview: [`docs/architecture.md`](docs/architecture.md)
- Comprehensive test plan: [`docs/test-plan.md`](docs/test-plan.md)
