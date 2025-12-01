# PostSender Design Discussion

## Current State Analysis

### What Exists (v1.0 - Python)
- ✅ **Working Python MCP server** with FastMCP
- ✅ **Claude SDK Agent** layer for drafting + commentary
- ✅ **POST snippet loader** with recipient parsing
- ✅ **12 passing tests** (TDD methodology)
- ✅ **Shell command**: `send "message"`
- ❌ **Gmail MCP not bundled** - expects external setup (this is broken!)

### Three Possible Directions

#### Option 1: Quick Fix (2 hours)
- Bundle Gmail MCP with existing v1.0
- Keep Python FastMCP architecture
- Just fix the broken Gmail dependency
- **Tradeoff**: No TUI, just command-line

#### Option 2: Python TUI (11 hours)
- Textual Python TUI (from SIMPLIFIED_ARCHITECTURE.md)
- Bundle Gmail MCP (Node.js)
- Direct Gmail MCP calls (remove FastMCP layer)
- Use `claude -p` subprocess for drafting
- **Tradeoff**: Python ecosystem, simpler architecture

#### Option 3: React TUI (3-4 days)
- Full React TUI with terminal styling (from postsender_simplified_plan.html)
- TypeScript/Node.js backend with Agent SDK
- Express API + Socket.io
- JSON storage for history
- **Tradeoff**: More complex, but richer UI possibilities

## Questions for Warren

1. **Which TUI do you want?**
   - Python Textual (simpler, faster, terminal-native)
   - React (web-based, more polished, longer dev time)

2. **What's your priority?**
   - Speed to working product
   - Rich UI/UX experience
   - Maintainability

3. **Do you want to keep v1.0's architecture or simplify?**
   - Keep FastMCP + Agent SDK layers
   - Simplify to direct Gmail MCP calls

## Architecture Comparison

| Aspect | Python TUI | React TUI |
|--------|-----------|-----------|
| **Time** | ~11 hours | 3-4 days |
| **Stack** | Python + Textual | TypeScript + React |
| **UI** | Terminal-native | Web-based in terminal |
| **Backend** | Direct MCP calls | Express API + Agent SDK |
| **Complexity** | Low | Medium |
| **Storage** | Gmail search | JSON files |

## Next Steps

Once we decide direction:
1. Create detailed implementation plan
2. Break into phases
3. Spawn executor agent for implementation
