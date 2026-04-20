# compressmcp

[![npm](https://img.shields.io/npm/v/compressmcp)](https://www.npmjs.com/package/compressmcp) [![GitHub](https://img.shields.io/badge/github-TheDecipherist%2Fcompressmcp-blue)](https://github.com/TheDecipherist/compressmcp)

Lossless JSON compression for Claude Code. Intercepts MCP tool responses and compresses large JSON payloads before they enter Claude's context window, cutting token usage by 40% on average with zero data loss.

---

## Why

Every MCP tool call that returns a database result, API response, or search payload lands verbatim in Claude's context. Verbose JSON field names like `transactionId`, `orderStatus`, and `repositoryDescription` repeat thousands of times across a session, burning tokens on structure rather than content.

compressmcp intercepts those responses and abbreviates the keys using [TerseJSON](https://github.com/tersejson/tersejson). Claude receives a compact dictionary plus the abbreviated data and reads it just as accurately, but at 40% fewer tokens.

---

## How it works

Three components work together automatically after a one-time install:

```
Claude asks for data
        │
        ▼
PreToolUse hook ─── detects curl/wget ──► blocks + redirects to mcp__compressmcp__fetch
        │
        ▼ (for direct MCP tool calls)
MCP tool runs, returns JSON
        │
        ▼
PostToolUse hook ─── valid JSON? ──► compress via TerseJSON ──► inject into context
                  └── not JSON?  ──► pass through unchanged
```

### Compressed output format

Every compressed response is three lines:

```
[compressmcp: 8,366→4,166 tokens (-50%) | lossless]
Keys: {"orderId":"a","orderStatus":"b","customerName":"c","totalAmount":"d",...}
[{"a":"order_001","b":"completed","c":"Customer 1","d":149.99,...},...]
```

Claude reads the `Keys` dictionary to decode field names before using the data. The full original structure is recoverable at any time, nothing is dropped, summarised, or truncated.

### Compression threshold

Only payloads above 500 estimated tokens (≈2,000 characters) are compressed. Smaller responses pass through unchanged to avoid unnecessary overhead.

---

## Installation

```bash
npm install -g compressmcp
compressmcp install
```

This registers the PostToolUse hook, PreToolUse hook, and MCP server in `~/.claude/settings.json`. Restart Claude Code to activate.

```bash
compressmcp check     # verify installation status
compressmcp uninstall # remove all hooks and server
```

### Manual build

```bash
git clone <repo>
cd compressmcp
npm install
npm run build
compressmcp install
```

---

## Test results

### Token savings benchmark

Tested across five realistic data shapes, each compressed through the real binary pipeline:

| Dataset | Original | Compressed | Savings |
|---|---|---|---|
| Orders (100 records) | 6,673 tok | 4,123 tok | **-38%** |
| GitHub repos (80 records) | 9,719 tok | 5,319 tok | **-45%** |
| Users (200 records) | 13,741 tok | 7,941 tok | **-42%** |
| Analytics events (500 records) | 28,781 tok | 17,656 tok | **-39%** |
| Products (60 records) | 6,748 tok | 4,198 tok | **-38%** |
| **Average** | | | **-40%** |

Datasets with longer field names compress further (GitHub repos). Datasets with shorter values and more repetition (analytics) hold steady around 39%.

### Latency overhead

Hook processing time measured over 10 runs per dataset. Times include Node.js process startup, which dominates the measurement.

| Dataset | Tokens saved | Avg time | Est. Claude saving* | Net |
|---|---|---|---|---|
| Orders (100) | 2,550 tok | 63ms | 43ms | -20ms |
| GitHub repos (80) | 4,400 tok | 61ms | 73ms | **+12ms** |
| Users (200) | 5,800 tok | 63ms | 97ms | **+34ms** |
| Analytics (500) | 11,125 tok | 69ms | 185ms | **+116ms** |
| Products (60) | 2,010 tok | 62ms | 34ms | -29ms |

\* Based on Claude Haiku input throughput (~60k tokens/sec). Positive Net = compression saves more time than it costs.

The ~60ms baseline is process startup — a one-time cost per tool call. The real payoff isn't speed: it's context space. Every token compressed is a token freed from Claude's context window, leaving more room for code, conversation, and reasoning on every subsequent turn in the session.

---

## Live status bar

compressmcp includes a Claude Code status bar that shows real-time compression stats for your active session.

![compressmcp status bar](https://raw.githubusercontent.com/TheDecipherist/compressmcp/main/compressmcp.png)

The bar displays left to right:

| Section | Example | Description |
|---|---|---|
| Context bar | `22% \| 43K/200K` | How full Claude's context window is (colour: green → yellow → red) |
| Model | `sonnet` | Active model (opus / sonnet / haiku) |
| Token savings | `-4.7M tok · 40%` | Tokens removed this session + compression efficiency percentage |
| Call count | `907 calls` | Number of compressed responses so far |
| Plan usage | `5h [9%] 7d [17%]` | Claude plan rate-limit utilisation (5-hour and 7-day windows) |
| Branch | `main` | Current git branch |

### Enable the status bar

Add the `statusLine` command to `~/.claude/settings.json` (done automatically by `compressmcp install`):

```json
{
  "statusLine": "compressmcp --status"
}
```

The command reads live context and rate-limit data piped in by Claude Code, combines it with compression stats from the current session's JSONL log, and writes the formatted bar to stdout.

---

## Safety

Compression is strictly lossless. The test suite includes:

- **Lossless roundtrip tests**, every compressed payload decompresses back to byte-identical JSON
- **No-passthrough-corruption tests**, non-JSON content passes through untouched
- **End-to-end integration tests**, spawns the real compiled binary, pipes actual HookInput JSON, asserts on stdout
- **Claude comprehension test**, verifies the compressed format (header + dictionary + data) is correctly structured for Claude to decode

```bash
npm test
```

262 tests across unit, safety, integration, and benchmark suites.

---

## License

MIT
