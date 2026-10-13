import type { BuyCostDTO, OfferCondition } from '@oa-lens/shared';

interface Row {
  asin: string;
  condition: string;
  fba_cost: number | null;
  fbm_cost: number | null;
  updated_at: number;
}

const toDto = (row: Row): BuyCostDTO => ({
  asin: row.asin,
  condition: row.condition as OfferCondition,
  fba: row.fba_cost,
  fbm: row.fbm_cost,
  updatedAt: row.updated_at,
});

export async function getBuyCost(
  db: D1Database,
  mp: string,
  asin: string,
  condition: OfferCondition,
): Promise<BuyCostDTO | null> {
  const row = await db
    .prepare(
      'SELECT asin, condition, fba_cost, fbm_cost, updated_at FROM buy_costs WHERE asin = ? AND mp = ? AND condition = ?',
    )
    .bind(asin, mp, condition)
    .first<Row>();
  return row ? toDto(row) : null;
}

export async function putBuyCost(
  db: D1Database,
  mp: string,
  value: { asin: string; condition: OfferCondition; fba: number | null; fbm: number | null },
): Promise<BuyCostDTO> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO buy_costs (asin, mp, condition, fba_cost, fbm_cost, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (asin, mp, condition) DO UPDATE SET fba_cost = excluded.fba_cost,
         fbm_cost = excluded.fbm_cost, updated_at = excluded.updated_at`,
    )
    .bind(value.asin, mp, value.condition, value.fba, value.fbm, now)
    .run();
  return { ...value, updatedAt: now };
}

export async function deleteBuyCost(
  db: D1Database,
  mp: string,
  asin: string,
  condition: OfferCondition,
): Promise<void> {
  await db
    .prepare('DELETE FROM buy_costs WHERE asin = ? AND mp = ? AND condition = ?')
    .bind(asin, mp, condition)
    .run();
}
