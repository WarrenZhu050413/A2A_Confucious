# Nabokov Backend Server

Local Node.js backend server that uses the Claude Agent SDK to enable subscription-based authentication for the Nabokov Chrome extension.

## Why Use This Backend?

The Chrome extension can work in three ways:

1. **✅ Backend (Best)**: Uses your Claude.ai subscription - no separate API key needed
2. **⚠️ Direct API**: Requires a separate Claude API key and billing
3. **📝 Mock**: Falls back to mock responses (no real AI)

The backend enables you to use your existing Claude.ai subscription instead of paying for separate API access.

## Setup

### Install Dependencies

```bash
cd backend
npm install
```

### Start the Server

```bash
npm start
```

You should see:

```
═══════════════════════════════════════════════════════
  🚀 Nabokov Backend Server
═══════════════════════════════════════════════════════

  Status: Running
  Host: 0.0.0.0 (override with HOST)
  Port: 3100 (override with PORT)
  Health: http://localhost:3100/health

  Endpoints:
    POST http://localhost:3100/api/message

  Authentication: Using Claude Agent SDK
    ✅ Subscription (if logged into claude.ai)
    ✅ API Key (if ANTHROPIC_API_KEY set)

═══════════════════════════════════════════════════════

Press Ctrl+C to stop
```

## How It Works

```
Chrome Extension → http://localhost:3100 → Claude Agent SDK → Claude API
                                              ↑
                                   Uses subscription auth automatically
```

The Agent SDK handles authentication by:
- Using your Claude.ai browser session (if logged in)
- Or using `ANTHROPIC_API_KEY` environment variable (if set)
- Or using other auth methods (AWS Bedrock, Google Vertex AI)

## Endpoints

### POST /api/message

Send a text-based message to Claude.

**Request:**
```json
{
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "options": {
    "system": "You are a helpful assistant",
    "maxTokens": 2048
  }
}
```

**Response:**
```json
{
  "content": "Hello! How can I help you today?",
  "metadata": {
    "timestamp": 1234567890,
    "source": "agent-sdk"
  }
}
```

### GET /health

Check if the backend is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1234567890,
  "message": "Nabokov backend server is running"
}
```

## Testing

### Quick Health Check

```bash
curl http://localhost:3100/health
```

### Test Message Endpoint

```bash
curl -X POST http://localhost:3100/api/message \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      { "role": "user", "content": "What is 2+2?" }
    ]
  }'
```

## Using with the Extension

Once the backend is running, the extension will automatically use it. No configuration needed!

The extension tries in this order:
1. **Backend** (localhost:3100) - subscription auth
2. **Direct API** (api.anthropic.com) - API key required
3. **Mock** - always works, but not real AI

## Troubleshooting

### Backend not starting

**Error:** `Cannot find module '@anthropic-ai/claude-agent-sdk'`

**Fix:**
```bash
cd backend
npm install
```

### Port already in use

**Error:** `Error: listen EADDRINUSE: address already in use :::3100`

**Fix:** Stop the other process or use a different port:
```bash
PORT=3101 npm start
```

Then update the extension's `BACKEND_URL` in `src/services/claudeAPIService.ts`.

### Authentication failing

**Symptom:** Backend returns errors about authentication

**Possible causes:**
1. Not logged into claude.ai in your browser
2. No `ANTHROPIC_API_KEY` environment variable set

**Fix:** Log into claude.ai or set API key:
```bash
export ANTHROPIC_API_KEY=your-key-here
npm start
```

### Extension not using backend

**Symptom:** Extension logs show "Backend not running"

**Checks:**
1. Is backend running? Check `http://localhost:3100/health`
2. Is it on the right port? Extension uses port 3100 by default
3. Check browser console for CORS errors

## Development

### Watch mode (auto-restart on changes)

```bash
npm run dev
```

### Logs

The backend logs all requests to console:
- `[Backend] Received /api/message request`
- `[Backend] Creating Agent SDK query...`
- `[Backend] ✓ Agent SDK success`

### Colored Debug Output

Logs now highlight key details with ANSI colors when running in a TTY (request ids, actions, status codes, timings). Use `NABOKOV_BACKEND_COLOR=0` to disable coloring for plain-text sinks or redirected logs. Quick legend:
- **Incoming** requests → cyan request ids and blue HTTP methods
- **Completed** responses → green action word with status code bucketed by color (200s green, 400s yellow, 500s red)
- **Retrying/Fallback** paths → yellow context
- **Errors** → red headers and messages, with multi-line metadata prefixed by `|`

Additional environment toggles:
- `HOST` – bind to a specific interface (defaults to `0.0.0.0`)
- `PORT` – choose a custom port (defaults to `3100`)
- `NABOKOV_BACKEND_NO_LISTEN=1` – skip listening so you can import `server.mjs` in scripts or tests without binding a socket

## Architecture

```
┌─────────────────────────────────────┐
│  Chrome Extension                   │
│  - Canvas                           │
│  - ChatModal                        │
│  - Card Generation                  │
└─────────────┬───────────────────────┘
              │ HTTP POST
              ▼
┌─────────────────────────────────────┐
│  Backend Server (localhost:3100)    │
│  - Express.js                       │
│  - CORS enabled                     │
│  - /api/message endpoint            │
└─────────────┬───────────────────────┘
              │ Agent SDK
              ▼
┌─────────────────────────────────────┐
│  Claude Agent SDK                   │
│  - Handles auth automatically       │
│  - Uses subscription                │
│  - Or API key                       │
└─────────────┬───────────────────────┘
              │ HTTPS
              ▼
┌─────────────────────────────────────┐
│  api.anthropic.com                  │
│  - Claude API                       │
│  - Returns AI responses             │
└─────────────────────────────────────┘
```

## License

Same as parent project (Nabokov Web Clipper)
