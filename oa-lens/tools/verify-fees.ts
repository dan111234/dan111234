// pnpm verify:fees B0AAA B0BBB ...  (docs/07 §7)
//
// Compares the local fee engine with SP-API quotes from the deployed Worker. Needs:
//   OA_LENS_WORKER_URL  e.g. https://oa-lens.<account>.workers.dev
//   EXT_SHARED_KEY      the Worker's shared key
// Prints asin | tier | outbound | price | api_ff | local_ff | diff | referral (api/local) | rule.
// Rows whose fulfillment or referral differs by more than $0.01 are red.
import {
  categoryIdToNameTable,
  detectFulfillmentKind,
  inferReferralRule,
  isMediaDisplayGroup,
  localFulfillmentFee,
  outboundWeight,
  periodForDate,
  referralFee,
  roundCatalogDims,
  sizeTier,
  tierShortName,
  type ReferralRule,
} from '@oa-lens/core';
import type { ApiResult, CatalogDTO, FeesTieredDTO } from '@oa-lens/shared';

const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const PRICES = ['9', '13', '350'] as const;

const workerUrl = (process.env.OA_LENS_WORKER_URL ?? '').replace(/\/+$/, '');
const sharedKey = process.env.EXT_SHARED_KEY ?? '';
const asins = process.argv
  .slice(2)
  .map((a) => a.trim().toUpperCase())
  .filter(Boolean);

if (!workerUrl || !sharedKey || asins.length === 0) {
  console.error(
    'Usage: OA_LENS_WORKER_URL=https://oa-lens.<account>.workers.dev EXT_SHARED_KEY=... pnpm verify:fees ASIN [ASIN...]',
  );
  process.exit(2);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET from the Worker, waiting out SP-API rate limits (the fees API allows about 1 call/2 s). */
async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${workerUrl}${path}`, {
      headers: { Authorization: `Bearer ${sharedKey}` },
    });
    const body = (await res.json()) as ApiResult<T>;
    if (body.ok) return body.data;
    if (body.error.code === 'RATE_LIMIT' && attempt < 4) {
      await sleep(Math.max(2, body.error.retryAfter ?? 2) * 1000 * (attempt + 1));
      continue;
    }
    throw new Error(`${body.error.code}: ${body.error.message}`);
  }
}

function describeRule(rule: ReferralRule): string {
  switch (rule.kind) {
    case 'fixed':
      return `fixed $${rule.fixed}`;
    case 'percent':
      return `${rule.percent}% (min $${rule.min})`;
    case 'range':
      return (
        rule.range
          .map((r) => `${r.percent}%${Number.isFinite(r.to) ? `≤$${r.to}` : ''}`)
          .join(', ') + (rule.portion ? ' tiered' : '')
      );
  }
}

const header = [
  'asin',
  'tier',
  'outbound',
  'price',
  'api_ff',
  'local_ff',
  'diff',
  'referral api/local',
  'rule',
];
const rows: string[][] = [];
const red = new Set<number>();
let failures = 0;
const today = new Date();
const period = periodForDate(today);

for (const asin of asins) {
  try {
    const [catalog, tiered] = await Promise.all([
      get<CatalogDTO>(`/v1/us/spapi/catalog/${asin}`),
      get<FeesTieredDTO>(`/v1/us/spapi/fees/${asin}/tiered`),
    ]);
    const pkg = catalog.packageDimensions;
    if (
      !pkg ||
      pkg.length == null ||
      pkg.width == null ||
      pkg.height == null ||
      pkg.weight == null
    ) {
      rows.push([asin, 'no dims', '', '', '', '', '', '', '']);
      red.add(rows.length - 1);
      continue;
    }
    const dims = roundCatalogDims({
      length: pkg.length,
      width: pkg.width,
      height: pkg.height,
      weight: pkg.weight,
    });
    const media = isMediaDisplayGroup(catalog.websiteDisplayGroup);
    const category = catalog.websiteDisplayGroup
      ? (categoryIdToNameTable[catalog.websiteDisplayGroup] ?? null)
      : null;
    const tier = sizeTier(dims, { media });
    if (!tier) {
      rows.push([asin, 'Unknown', '', '', '', '', '', '', '']);
      red.add(rows.length - 1);
      continue;
    }
    const { rule, source } = inferReferralRule(
      { 9: tiered['9'].ReferralFee, 13: tiered['13'].ReferralFee, 350: tiered['350'].ReferralFee },
      { category, productType: catalog.productType },
    );
    const { kind } = detectFulfillmentKind({ tier, dims, tiered, rule, media, today });
    const outbound = outboundWeight(tier, dims, { media });
    for (const p of PRICES) {
      const price = Number(p);
      const api = tiered[p].FBAFees;
      const local = localFulfillmentFee({ tier, dims, price, period, kind, media, date: today });
      const diff = local == null ? null : Math.round((local - api) * 100) / 100;
      const localRef = referralFee(rule, price);
      const refDiff = Math.abs(localRef - tiered[p].ReferralFee);
      rows.push([
        asin,
        `${tierShortName(tier)}${kind === 'standard' ? '' : ` ${kind}`}`,
        outbound.toFixed(3),
        `$${price}`,
        api.toFixed(2),
        local == null ? '--' : local.toFixed(2),
        diff == null ? '--' : diff.toFixed(2),
        `${tiered[p].ReferralFee.toFixed(2)}/${localRef.toFixed(2)}`,
        `${describeRule(rule)}${source === 'fallback' ? ' (fallback!)' : ''}`,
      ]);
      if (diff == null || Math.abs(diff) > 0.01 || refDiff > 0.01) {
        red.add(rows.length - 1);
        failures++;
      }
    }
  } catch (err) {
    rows.push([
      asin,
      `error: ${err instanceof Error ? err.message : String(err)}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    red.add(rows.length - 1);
    failures++;
  }
}

const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join(' | ');
console.log(line(header));
console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
rows.forEach((r, i) => console.log(red.has(i) ? `${RED}${line(r)}${RESET}` : line(r)));
console.log(
  `${DIM}${asins.length} ASINs, ${rows.length} rows, ${failures} over $0.01. Period: ${period}, ${today.toISOString().slice(0, 10)}.${RESET}`,
);
process.exitCode = failures > 0 ? 1 : 0;
