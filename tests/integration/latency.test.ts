import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const BINARY = resolve(process.cwd(), 'dist/index.js');
const RUNS = 10;

// Conservative estimate of Claude's input token processing rate.
// Claude Haiku processes ~60k tokens/sec input — so 1 token ≈ 0.017ms.
// Fewer tokens in context = faster TTFT (time to first token).
const CLAUDE_TOKENS_PER_MS = 60;

if (!existsSync(BINARY)) {
  throw new Error(`dist/index.js not found — run "npm run build" before running integration tests`);
}

interface LatencyResult {
  label: string;
  originalTokens: number;
  compressedTokens: number;
  tokensSaved: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  efficiency: number; // tokens saved per ms of hook overhead
  estimatedClaudeSavingMs: number;
  netBenefitMs: number;
}

function measureHook(label: string, jsonText: string): LatencyResult {
  const hookInput = JSON.stringify({
    session_id: 'latency-bench',
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__fetch__get',
    tool_input: {},
    tool_response: [{ type: 'text', text: jsonText }],
    cwd: '/tmp',
  });

  const times: number[] = [];
  let originalTokens = 0;
  let compressedTokens = 0;

  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const result = spawnSync('node', [BINARY, '--hook'], {
      input: hookInput,
      encoding: 'utf8',
      timeout: 15_000,
    });
    const elapsed = performance.now() - start;
    times.push(elapsed);

    if (i === 0) {
      const parsed = JSON.parse(result.stdout);
      const text = parsed.hookSpecificOutput.updatedMCPToolOutput[0].text as string;
      const match = text.split('\n')[0].match(/([\d,]+)→([\d,]+)/);
      if (!match) throw new Error(`Bad header in ${label}`);
      originalTokens = parseInt(match[1].replace(/,/g, ''));
      compressedTokens = parseInt(match[2].replace(/,/g, ''));
    }
  }

  const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const tokensSaved = originalTokens - compressedTokens;
  const estimatedClaudeSavingMs = tokensSaved / CLAUDE_TOKENS_PER_MS;
  const netBenefitMs = estimatedClaudeSavingMs - avgMs;

  return {
    label,
    originalTokens,
    compressedTokens,
    tokensSaved,
    avgMs,
    minMs,
    maxMs,
    efficiency: tokensSaved / avgMs,
    estimatedClaudeSavingMs,
    netBenefitMs,
  };
}

// ─── Fixture generators (same shapes as benchmark) ───────────────────────────

function makeOrders(count = 100) {
  const statuses = ['completed', 'pending', 'cancelled'];
  const categories = ['electronics', 'clothing', 'home_goods', 'sports', 'books'];
  return Array.from({ length: count }, (_, i) => ({
    orderId: `order_${String(i).padStart(3, '0')}`,
    customerId: `cust_${(i * 7 + 13) % 200}`,
    customerName: `Customer ${i}`,
    orderStatus: statuses[i % 3],
    totalAmount: parseFloat((19.99 + (i * 13.37) % 980).toFixed(2)),
    itemCount: (i % 8) + 1,
    productCategory: categories[i % categories.length],
    shippingAddress: `${100 + i} Main Street, Springfield`,
    paymentMethod: i % 2 === 0 ? 'credit_card' : 'paypal',
    createdAt: `2026-01-${String(1 + (i % 28)).padStart(2, '0')}`,
  }));
}

function makeGithubRepos(count = 80) {
  const languages = ['TypeScript', 'Python', 'Go', 'Rust', 'JavaScript', 'Java'];
  const licenses = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause'];
  return Array.from({ length: count }, (_, i) => ({
    repositoryId: i + 1000,
    repositoryName: `project-${i}`,
    repositoryDescription: `A sample repository for project ${i} with various features`,
    repositoryOwner: `org_${i % 10}`,
    primaryLanguage: languages[i % languages.length],
    stargazersCount: (i * 47) % 5000,
    forksCount: (i * 13) % 800,
    openIssuesCount: (i * 7) % 120,
    defaultBranch: 'main',
    licenseIdentifier: licenses[i % licenses.length],
    isPrivateRepository: i % 4 === 0,
    isForkRepository: i % 6 === 0,
    createdAtTimestamp: `2024-${String(1 + (i % 12)).padStart(2, '0')}-01T00:00:00Z`,
    updatedAtTimestamp: `2026-01-${String(1 + (i % 28)).padStart(2, '0')}T12:00:00Z`,
    pushedAtTimestamp: `2026-04-${String(1 + (i % 18)).padStart(2, '0')}T08:30:00Z`,
  }));
}

function makeUsers(count = 200) {
  const departments = ['engineering', 'marketing', 'sales', 'support', 'finance'];
  const roles = ['admin', 'editor', 'viewer', 'manager'];
  const subscriptions = ['free', 'pro', 'enterprise'];
  return Array.from({ length: count }, (_, i) => ({
    userId: `usr_${String(i).padStart(5, '0')}`,
    emailAddress: `user${i}@example.com`,
    displayName: `User ${i}`,
    departmentName: departments[i % departments.length],
    userRole: roles[i % roles.length],
    subscriptionTier: subscriptions[i % subscriptions.length],
    isEmailVerified: i % 5 !== 0,
    isAccountActive: i % 10 !== 0,
    loginCount: (i * 17) % 500,
    lastLoginAt: `2026-04-${String(1 + (i % 18)).padStart(2, '0')}`,
    createdAt: `2024-${String(1 + (i % 12)).padStart(2, '0')}-15`,
  }));
}

function makeAnalyticsEvents(count = 500) {
  const eventTypes = ['page_view', 'button_click', 'form_submit', 'purchase', 'search'];
  const deviceTypes = ['desktop', 'mobile', 'tablet'];
  const browsers = ['chrome', 'safari', 'firefox', 'edge'];
  return Array.from({ length: count }, (_, i) => ({
    eventId: `evt_${i}`,
    eventType: eventTypes[i % eventTypes.length],
    sessionIdentifier: `sess_${(i * 3) % 100}`,
    userId: `usr_${(i * 7) % 200}`,
    deviceType: deviceTypes[i % deviceTypes.length],
    browserName: browsers[i % browsers.length],
    pageUrl: `/page/${i % 20}`,
    referrerUrl: i % 3 === 0 ? 'https://google.com' : null,
    durationMs: (i * 137) % 30000,
    timestampMs: 1745000000000 + i * 60000,
  }));
}

function makeProducts(count = 60) {
  const categories = ['electronics', 'clothing', 'furniture', 'kitchen', 'outdoor'];
  const conditions = ['new', 'refurbished', 'open_box'];
  return Array.from({ length: count }, (_, i) => ({
    productId: `prod_${String(i).padStart(4, '0')}`,
    productName: `Product ${i} — Premium Edition`,
    productDescription: `High quality product number ${i} with excellent features and durability`,
    categoryName: categories[i % categories.length],
    brandName: `Brand${i % 15}`,
    skuCode: `SKU-${String(i * 7 + 100).padStart(6, '0')}`,
    retailPriceAmount: parseFloat((9.99 + (i * 11.5) % 990).toFixed(2)),
    salePriceAmount: parseFloat((7.99 + (i * 9.3) % 790).toFixed(2)),
    stockQuantity: (i * 13) % 500,
    averageRating: parseFloat((3.0 + (i % 20) / 10).toFixed(1)),
    reviewCount: (i * 23) % 2000,
    isAvailable: i % 8 !== 0,
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Latency benchmark', () => {
  const datasets: Array<{ label: string; json: string }> = [
    { label: 'orders (100)',      json: JSON.stringify(makeOrders(100)) },
    { label: 'github-repos (80)', json: JSON.stringify(makeGithubRepos(80)) },
    { label: 'users (200)',       json: JSON.stringify(makeUsers(200)) },
    { label: 'analytics (500)',   json: JSON.stringify(makeAnalyticsEvents(500)) },
    { label: 'products (60)',     json: JSON.stringify(makeProducts(60)) },
  ];

  it(`should complete each hook invocation in under 500ms (avg over ${RUNS} runs)`, () => {
    const results: LatencyResult[] = datasets.map(({ label, json }) => measureHook(label, json));

    const r = (n: number) => Math.round(n);
    const f = (n: number) => n.toLocaleString();
    const pad  = (s: string, n: number) => s.padEnd(n);
    const lpad = (s: string, n: number) => s.padStart(n);

    const lines = [
      '',
      `Latency Benchmark  (${RUNS} runs per dataset, times include Node.js process startup)`,
      '─'.repeat(90),
      `${pad('Dataset', 20)} ${lpad('Saved tok', 10)} ${lpad('Avg ms', 8)} ${lpad('Min ms', 8)} ${lpad('Max ms', 8)} ${lpad('Tok/ms', 8)} ${lpad('Est.saving', 11)} ${lpad('Net', 8)}`,
      '─'.repeat(90),
      ...results.map(res =>
        `${pad(res.label, 20)} ${lpad(f(res.tokensSaved), 10)} ${lpad(r(res.avgMs) + 'ms', 8)} ${lpad(r(res.minMs) + 'ms', 8)} ${lpad(r(res.maxMs) + 'ms', 8)} ${lpad(r(res.efficiency) + '/ms', 8)} ${lpad(r(res.estimatedClaudeSavingMs) + 'ms', 11)} ${lpad((res.netBenefitMs >= 0 ? '+' : '') + r(res.netBenefitMs) + 'ms', 8)}`
      ),
      '─'.repeat(90),
      '',
      `  Tok/ms   = tokens removed from Claude's context per ms of hook overhead`,
      `  Est.saving = tokens_saved ÷ ${CLAUDE_TOKENS_PER_MS} tok/ms (Claude Haiku input throughput estimate)`,
      `  Net     = estimated Claude saving minus hook overhead (positive = net win)`,
      '',
    ];

    console.log(lines.join('\n'));

    for (const res of results) {
      expect(res.avgMs).toBeLessThan(500);
      expect(res.minMs).toBeGreaterThan(0);
    }
  });
});
