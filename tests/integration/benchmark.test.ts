import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const BINARY = resolve(process.cwd(), 'dist/index.js');

if (!existsSync(BINARY)) {
  throw new Error(`dist/index.js not found — run "npm run build" before running integration tests`);
}

function runHook(jsonText: string): string {
  const hookInput = JSON.stringify({
    session_id: 'bench-session',
    hook_event_name: 'PostToolUse',
    tool_name: 'mcp__fetch__get',
    tool_input: {},
    tool_response: [{ type: 'text', text: jsonText }],
    cwd: '/tmp',
  });
  const result = spawnSync('node', [BINARY, '--hook'], {
    input: hookInput,
    encoding: 'utf8',
    timeout: 10_000,
  });
  const parsed = JSON.parse(result.stdout);
  return parsed.hookSpecificOutput.updatedMCPToolOutput[0].text as string;
}

function parseHeader(text: string): { original: number; compressed: number; pct: number } {
  const match = text.split('\n')[0].match(/([\d,]+)→([\d,]+) tokens \(-(\d+)%\)/);
  if (!match) throw new Error(`Bad header: ${text.split('\n')[0]}`);
  return {
    original: parseInt(match[1].replace(/,/g, '')),
    compressed: parseInt(match[2].replace(/,/g, '')),
    pct: parseInt(match[3]),
  };
}

// ─── Fixture generators ───────────────────────────────────────────────────────

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
  const departments = ['engineering', 'marketing', 'sales', 'support', 'finance', 'operations'];
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
  const eventTypes = ['page_view', 'button_click', 'form_submit', 'purchase', 'search', 'logout'];
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
  const categories = ['electronics', 'clothing', 'furniture', 'kitchen', 'outdoor', 'beauty'];
  const conditions = ['new', 'refurbished', 'open_box'];
  const currencies = ['USD', 'EUR', 'GBP'];
  return Array.from({ length: count }, (_, i) => ({
    productId: `prod_${String(i).padStart(4, '0')}`,
    productName: `Product ${i} — Premium Edition`,
    productDescription: `High quality product number ${i} with excellent features and long-term durability`,
    categoryName: categories[i % categories.length],
    brandName: `Brand${i % 15}`,
    skuCode: `SKU-${String(i * 7 + 100).padStart(6, '0')}`,
    retailPriceAmount: parseFloat((9.99 + (i * 11.5) % 990).toFixed(2)),
    salePriceAmount: parseFloat((7.99 + (i * 9.3) % 790).toFixed(2)),
    currencyCode: currencies[i % currencies.length],
    stockQuantity: (i * 13) % 500,
    productCondition: conditions[i % conditions.length],
    averageRating: parseFloat((3.0 + (i % 20) / 10).toFixed(1)),
    reviewCount: (i * 23) % 2000,
    isAvailable: i % 8 !== 0,
    publishedAt: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
  }));
}

// ─── Benchmark suite ──────────────────────────────────────────────────────────

interface BenchResult {
  label: string;
  original: number;
  compressed: number;
  pct: number;
}

describe('Token savings benchmark', () => {
  const results: BenchResult[] = [];

  const datasets: Array<{ label: string; data: unknown[] }> = [
    { label: 'orders (100)',       data: makeOrders(100) },
    { label: 'github-repos (80)',  data: makeGithubRepos(80) },
    { label: 'users (200)',        data: makeUsers(200) },
    { label: 'analytics (500)',    data: makeAnalyticsEvents(500) },
    { label: 'products (60)',      data: makeProducts(60) },
  ];

  for (const { label, data } of datasets) {
    it(`should compress ${label}`, () => {
      const json = JSON.stringify(data);
      const compressedText = runHook(json);
      const { original, compressed, pct } = parseHeader(compressedText);

      results.push({ label, original, compressed, pct });

      expect(original).toBeGreaterThan(500);
      expect(compressed).toBeLessThan(original);
      expect(pct).toBeGreaterThan(20);
    });
  }

  it('should average greater than 40% token savings across all datasets', () => {
    // Run all datasets fresh so this test is self-contained
    const fresh: BenchResult[] = datasets.map(({ label, data }) => {
      const json = JSON.stringify(data);
      const compressedText = runHook(json);
      const { original, compressed, pct } = parseHeader(compressedText);
      return { label, original, compressed, pct };
    });

    const avg = Math.round(fresh.reduce((sum, r) => sum + r.pct, 0) / fresh.length);

    const pad = (s: string, n: number) => s.padEnd(n);
    const lpad = (s: string, n: number) => s.padStart(n);

    const lines = [
      '',
      'Token Savings Benchmark',
      '─'.repeat(65),
      `${pad('Dataset', 22)} ${lpad('Original', 10)} ${lpad('Compressed', 12)} ${lpad('Savings', 8)}`,
      '─'.repeat(65),
      ...fresh.map(r =>
        `${pad(r.label, 22)} ${lpad(r.original.toLocaleString() + ' tok', 10)} ${lpad(r.compressed.toLocaleString() + ' tok', 12)} ${lpad('-' + r.pct + '%', 8)}`
      ),
      '─'.repeat(65),
      `${pad('Average', 22)} ${lpad('', 10)} ${lpad('', 12)} ${lpad('-' + avg + '%', 8)}`,
      '',
    ];

    console.log(lines.join('\n'));

    expect(avg).toBeGreaterThanOrEqual(40);
  });
});
