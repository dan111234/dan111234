// FBA Fees and FBM Fees popups (docs/02 §K-1, §K-2; screenshots 04, 05).
import { placementOptions, referralRateLabel, type FbaColumn } from '@oa-lens/core';
import type { LowInventorySetting, PlacementLocationSetting } from '@oa-lens/shared';
import type { ComponentChildren } from 'preact';
import { fbmShipRevenue } from '../lib/productInput';
import type { WidgetModel } from './model';
import { Chip, cx, money, MoneyInput, plain, Select, Switch } from './ui';

const DISCOUNTS = [0, 5, 10, 15, 20, 25];

function Row(props: {
  label: ComponentChildren;
  toggle?: ComponentChildren;
  cells: ComponentChildren[];
  bold?: boolean;
  shade?: boolean;
  class?: string;
}) {
  return (
    <div
      class={cx(
        'oal-flex oal-min-h-[24px] oal-items-center',
        props.shade && 'oal-bg-[#f5f6f6]',
        props.bold && 'oal-font-bold',
        props.class,
      )}
    >
      <div class="oal-flex oal-min-w-0 oal-flex-1 oal-items-center oal-gap-[6px] oal-py-[3px] oal-pl-[12px]">
        {props.label}
      </div>
      <div class="oal-flex oal-w-[34px] oal-shrink-0 oal-justify-center">{props.toggle}</div>
      {props.cells.map((cell, i) => (
        <div
          key={i}
          class="oal-flex oal-w-[118px] oal-shrink-0 oal-items-center oal-justify-end oal-border-l oal-border-[#e3e6e6] oal-py-[3px] oal-pr-[12px] first:oal-border-l"
        >
          {cell}
        </div>
      ))}
    </div>
  );
}

function DiscountChips({ model }: { model: WidgetModel }) {
  const discount = model.overrides.discount ?? 0;
  const custom = !DISCOUNTS.includes(discount);
  return (
    <span class="oal-flex oal-flex-wrap oal-items-center oal-gap-[4px] oal-font-normal">
      <span class="oal-text-[12px]">Discount:</span>
      {DISCOUNTS.map((d) => (
        <Chip key={d} active={discount === d} onClick={() => model.setOverrides({ discount: d })}>
          {d}
        </Chip>
      ))}
      <span class="oal-relative oal-inline-flex oal-w-[44px]">
        <MoneyInput
          value={custom ? discount : null}
          decimals={1}
          clearable={false}
          placeholder="%"
          inputClass={cx(
            '!oal-h-[20px] !oal-rounded-full !oal-text-[11px]',
            custom && '!oal-border-[#3d8b37]',
          )}
          onChange={(v) =>
            model.setOverrides({ discount: v == null ? 0 : Math.min(100, Math.max(0, v)) })
          }
        />
      </span>
    </span>
  );
}

function money2(v: number | null | undefined) {
  return plain(v, 2);
}

function NetCell({ value }: { value: number | null | undefined }) {
  return (
    <span
      class={cx(
        'oal-text-[15px] oal-font-bold',
        (value ?? 0) < 0 ? 'oal-text-[#cc0c39]' : 'oal-text-[#3d8b37]',
      )}
    >
      {money2(value)}
    </span>
  );
}

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const REGIONS = [
  { value: 'west' as const, label: 'West' },
  { value: 'central' as const, label: 'Central' },
  { value: 'east' as const, label: 'East' },
];
const LOW_INV: { value: LowInventorySetting; label: string }[] = [
  { value: 'select', label: 'Select' },
  { value: '0-14', label: '0-14' },
  { value: '14-21', label: '14-21' },
  { value: '21-28', label: '21-28' },
  { value: '28+', label: '28+' },
];

export function FbaFeesPopup({ model }: { model: WidgetModel }) {
  const { result, settings, overrides: o } = model;
  const m = settings.us;
  const np = result.fba.nonPeak;
  const pk = result.fba.peak;
  if (!np || !pk) {
    return (
      <div class="oal-p-[12px] oal-text-[13px]">
        To estimate fees, the extension needs sell price, weight and dimensions.
      </div>
    );
  }
  const cols: [FbaColumn, FbaColumn] = [np, pk];
  const tier = result.tier!;
  const standard = tier === 'Small Standard-Size' || tier === 'Large Standard-Size';
  const placementOn =
    o.placementEnabled ??
    (standard ? m.fbaInboundPlacementStandardEnabled : m.fbaInboundPlacementEnabled);
  const region =
    o.placementRegion ??
    (standard ? m.fbaInboundPlacementStandardRegion : m.fbaInboundPlacementRegion);
  const locations =
    o.placementLocations ??
    (standard ? m.fbaInboundPlacementStandardLocation : m.fbaInboundPlacementLocation);
  const locOptions = placementOptions(tier);
  const prepOn = o.prepOn ?? m.fbaExtrasDefaultOn;
  const current = result.todayPeriod;
  const each = (fn: (c: FbaColumn) => ComponentChildren) => cols.map(fn);
  const na = (v: number | null) => (v == null ? 'N/A' : money2(v));
  const sources = new Set(cols.map((c) => c.fulfillmentSource));

  return (
    <div class="oal-pb-[6px] oal-text-[13px]">
      <div class="oal-flex oal-items-end oal-border-b oal-border-[#e3e6e6] oal-pb-[4px]">
        <div class="oal-flex-1 oal-pl-[12px] oal-text-[16px] oal-font-bold">FBA Fees</div>
        <div class="oal-w-[34px]" />
        {(['nonPeak', 'peak'] as const).map((p) => (
          <div
            key={p}
            class={cx(
              'oal-w-[118px] oal-border-l oal-border-[#e3e6e6] oal-pr-[12px] oal-text-right oal-text-[12px] oal-leading-tight',
              p === current && 'oal-bg-[#f0f8ef]',
            )}
          >
            <div class="oal-font-bold">{p === 'nonPeak' ? 'Non-Peak' : 'Peak'}</div>
            <div>{p === 'nonPeak' ? '01/15 - 10/14' : '10/15 - 01/14'}</div>
          </div>
        ))}
      </div>

      <Row
        bold
        label="Sell Price"
        cells={[0, 1].map((i) => (
          <MoneyInput
            key={i}
            value={model.values.sellFba}
            live={settings.smartInput}
            ariaLabel="FBA sell price"
            inputClass="!oal-h-[26px]"
            onChange={(v) => model.setSell('fba', v)}
          />
        ))}
      />
      <Row
        shade
        label={`Referral Fee (${referralRateLabel(result.referralRule, np.price)})`}
        cells={each((c) => money2(c.referral))}
        class="oal-pl-[10px]"
      />
      <Row
        label={
          <span
            title={
              sources.has('local')
                ? 'Local fee table (dimensions edited or no SP-API quote)'
                : 'SP-API quote for today; the other period uses the fee table plus the same difference'
            }
          >
            Fulfillment Fee
          </span>
        }
        cells={each((c) => money2(c.fulfillment))}
        class="oal-pl-[10px]"
      />
      <Row
        shade
        label="Variable Closing Fees"
        cells={each((c) => money2(c.closing))}
        class="oal-pl-[10px]"
      />
      <Row
        label={
          <>
            Monthly storage
            <Select
              value={o.storageMonths ?? m.storageMonths}
              options={MONTHS}
              onChange={(v) => model.setOverrides({ storageMonths: v })}
            />
            <span class="oal-truncate oal-text-[12px] oal-text-[#565959]">{np.storageHint}</span>
          </>
        }
        toggle={
          <Switch
            on={o.storageEnabled ?? m.fbaCalcStorageFee}
            onChange={(on) => model.setOverrides({ storageEnabled: on })}
          />
        }
        cells={each((c) => money2(c.storage))}
        class="oal-pl-[10px]"
      />
      <Row
        shade
        label={
          <>
            Inbound Placement Fee
            {locOptions ? (
              <>
                <Select
                  value={region}
                  options={REGIONS}
                  onChange={(v) => model.setOverrides({ placementRegion: v })}
                />
                <Select
                  value={locations}
                  options={locOptions.map((l) => ({
                    value: l as PlacementLocationSetting,
                    label: l === 5 ? '5+' : String(l),
                  }))}
                  onChange={(v) => model.setOverrides({ placementLocations: v })}
                />
              </>
            ) : null}
          </>
        }
        toggle={
          locOptions && (
            <Switch
              on={placementOn}
              onChange={(on) => model.setOverrides({ placementEnabled: on })}
            />
          )
        }
        cells={each((c) => na(c.placement))}
        class="oal-pl-[10px]"
      />
      <Row
        label={
          <>
            Low Inventory Fee
            {np.lowInventory != null && (
              <Select
                value={o.lowInventoryPeriod ?? m.fbaLowInventoryPeriod}
                options={LOW_INV}
                onChange={(v) => model.setOverrides({ lowInventoryPeriod: v })}
              />
            )}
            <span class="oal-text-[12px] oal-text-[#565959]">Historical days of supply</span>
          </>
        }
        toggle={
          np.lowInventory != null && (
            <Switch
              on={o.lowInventoryEnabled ?? m.fbaLowInventoryEnabled}
              onChange={(on) => model.setOverrides({ lowInventoryEnabled: on })}
            />
          )
        }
        cells={each((c) => na(c.lowInventory))}
        class="oal-pl-[10px]"
      />
      <Row
        shade
        label={
          <span class="oal-flex oal-flex-wrap oal-gap-[4px]">
            {m.fbaExtrasChips.map((chip) => {
              const on = prepOn.includes(chip.id);
              return (
                <Chip
                  key={chip.id}
                  active={on}
                  onClick={() =>
                    model.setOverrides({
                      prepOn: on ? prepOn.filter((id) => id !== chip.id) : [...prepOn, chip.id],
                    })
                  }
                >
                  {on ? '✓' : '+'} {chip.label} {chip.amount.toFixed(2)}
                </Chip>
              );
            })}
          </span>
        }
        toggle={
          <Switch
            on={o.prepEnabled ?? m.fbaExtrasEnabled}
            onChange={(on) => model.setOverrides({ prepEnabled: on })}
          />
        }
        cells={each((c) => money2(c.prep))}
        class="oal-pl-[10px]"
      />
      <Row
        label="Other"
        toggle={
          <Switch
            on={o.fbaOtherEnabled ?? m.fbaOtherEnabled}
            onChange={(on) => model.setOverrides({ fbaOtherEnabled: on })}
          />
        }
        cells={[0, 1].map((i) => (
          <MoneyInput
            key={i}
            value={o.fbaOther ?? m.fbaOther}
            inputClass="!oal-h-[26px]"
            onChange={(v) => model.setOverrides({ fbaOther: v ?? 0 })}
          />
        ))}
        class="oal-pl-[10px]"
      />
      <Row
        shade
        label={
          <>
            Ship to FBA
            {m.fbaInboundUseDim && result.dimWeight != null && (
              <span
                class="oal-text-[12px] oal-text-[#565959]"
                title="Uses the larger of unit weight and dimensional weight"
              >
                Dim Wt {result.dimWeight.toFixed(2)} lbs
              </span>
            )}
          </>
        }
        toggle={
          <Switch
            on={o.shipToFbaEnabled ?? m.fbaInboundEnabled}
            onChange={(on) => model.setOverrides({ shipToFbaEnabled: on })}
          />
        }
        cells={[0, 1].map((i) => (
          <MoneyInput
            key={i}
            value={np.shipToFba}
            inputClass="!oal-h-[26px]"
            onChange={(v) => model.setOverrides({ shipToFba: v })}
          />
        ))}
        class="oal-pl-[10px]"
      />
      <Row bold label="Expenses" cells={each((c) => money2(c.expenses))} />
      <Row
        bold
        label={
          <>
            Buy Cost
            <DiscountChips model={model} />
          </>
        }
        cells={[0, 1].map((i) => (
          <MoneyInput
            key={i}
            value={(o.discount ?? 0) > 0 ? np.buyCost : model.values.buyFba}
            decimals={settings.decimalBuyCost}
            inputClass="!oal-h-[26px]"
            onChange={(v) =>
              model.setBuy(
                'fba',
                v == null ? null : (o.discount ?? 0) > 0 ? v / (1 - (o.discount ?? 0) / 100) : v,
              )
            }
          />
        ))}
        class="oal-py-[2px]"
      />
      {(o.discount ?? 0) > 0 && (
        <div class="oal-pl-[12px] oal-text-[11px] oal-text-[#565959]">
          Discounted Buy Cost ({o.discount}% off {money2(model.values.buyFba)})
        </div>
      )}
      <Row
        shade
        label="Buy Cost Sales Tax"
        toggle={
          <Switch
            on={o.taxEnabled ?? settings.useSalesTax}
            onChange={(on) => model.setOverrides({ taxEnabled: on })}
            title={`${m.salesTax}% (Settings > Sell Price/Buy Cost)`}
          />
        }
        cells={each((c) => money2(c.tax))}
        class="oal-pl-[10px]"
      />
      {sources.has('local') && (
        <div class="oal-px-[12px] oal-py-[2px] oal-text-[11px] oal-text-[#b12704]">
          Estimating with the local fee table (dimensions edited or no SP-API quote).
        </div>
      )}
      <Row
        bold
        label={<span class="oal-text-[15px]">Net</span>}
        cells={each((c) => (
          <NetCell value={c.net} />
        ))}
      />
    </div>
  );
}

export function FbmFeesPopup({ model }: { model: WidgetModel }) {
  const { result, settings, overrides: o } = model;
  const m = settings.us;
  const c = result.fbm.column;
  if (!c) {
    return (
      <div class="oal-p-[12px] oal-text-[13px]">
        To estimate fees, the extension needs sell price, weight and dimensions.
      </div>
    );
  }
  const shipRev = fbmShipRevenue(settings);
  const method = o.fbmShipMethod ?? m.mfnShipEstimateMethod;
  const service = o.fbmUspsService ?? m.mfnUSPSMethod;
  const zone = o.fbmZone ?? m.mfnShipZone;
  const describe =
    method === 'usps' ? `USPS Zone ${zone}` : method === 'pound' ? '$/lb' : 'Flat Rate';

  return (
    <div class="oal-pb-[6px] oal-text-[13px]">
      <div class="oal-border-b oal-border-[#e3e6e6] oal-px-[12px] oal-pb-[6px] oal-text-[16px] oal-font-bold">
        FBM Fees
      </div>
      <Row
        bold
        label={`Price (${money(c.price - shipRev)}) + Your Ship Rev (${money(shipRev)})`}
        cells={[
          <MoneyInput
            key="p"
            value={model.values.sellFbm}
            live={settings.smartInput}
            inputClass="!oal-h-[26px]"
            onChange={(v) => model.setSell('fbm', v)}
          />,
        ]}
      />
      <Row
        label={`Referral Fee (${referralRateLabel(result.referralRule, c.price)})`}
        cells={[money2(c.referral)]}
        class="oal-pl-[10px]"
        shade
      />
      <Row
        label={
          <span class="oal-flex oal-flex-col oal-gap-[3px]">
            <span class="oal-flex oal-flex-wrap oal-items-center oal-gap-[4px]">
              Ship to Buyer - {describe}
              <Chip
                active={method === 'usps'}
                onClick={() => model.setOverrides({ fbmShipMethod: 'usps', fbmShip: null })}
              >
                USPS
              </Chip>
              <Chip
                active={method === 'pound'}
                onClick={() => model.setOverrides({ fbmShipMethod: 'pound', fbmShip: null })}
              >
                $/lb
              </Chip>
              <Chip
                active={method === 'flat'}
                onClick={() => model.setOverrides({ fbmShipMethod: 'flat', fbmShip: null })}
              >
                Flat
              </Chip>
            </span>
            {method === 'usps' && (
              <span class="oal-flex oal-flex-wrap oal-items-center oal-gap-[4px]">
                {(
                  [
                    ['ground_advantage', 'Ground Advantage'],
                    ['priority', 'Priority'],
                    ['media_mail', 'Media Mail'],
                  ] as const
                ).map(([value, label]) => (
                  <Chip
                    key={value}
                    active={service === value}
                    onClick={() => model.setOverrides({ fbmUspsService: value, fbmShip: null })}
                  >
                    {label}
                  </Chip>
                ))}
                <span class="oal-ml-[8px] oal-text-[12px]">Zone</span>
                {([4, 5, 8] as const).map((z) => (
                  <Chip
                    key={z}
                    active={zone === z}
                    onClick={() => model.setOverrides({ fbmZone: z, fbmShip: null })}
                  >
                    {z}
                  </Chip>
                ))}
              </span>
            )}
            {method === 'pound' && (
              <span class="oal-flex oal-items-center oal-gap-[4px] oal-text-[12px]">
                $/lb
                <span class="oal-w-[70px]">
                  <MoneyInput
                    value={o.fbmPoundPrice ?? m.mfnShipPoundPrice}
                    inputClass="!oal-h-[22px]"
                    onChange={(v) => model.setOverrides({ fbmPoundPrice: v ?? 0, fbmShip: null })}
                  />
                </span>
              </span>
            )}
            {method === 'flat' && (
              <span class="oal-flex oal-items-center oal-gap-[4px] oal-text-[12px]">
                Flat $
                <span class="oal-w-[70px]">
                  <MoneyInput
                    value={o.fbmFlatRate ?? m.mfnShipFlatRate}
                    inputClass="!oal-h-[22px]"
                    onChange={(v) => model.setOverrides({ fbmFlatRate: v ?? 0, fbmShip: null })}
                  />
                </span>
              </span>
            )}
          </span>
        }
        toggle={
          <Switch
            on={o.fbmShipEnabled ?? m.mfnShipEstimate}
            onChange={(on) => model.setOverrides({ fbmShipEnabled: on })}
          />
        }
        cells={[
          <MoneyInput
            key="s"
            value={c.shipToBuyer}
            inputClass="!oal-h-[26px]"
            onChange={(v) => model.setOverrides({ fbmShip: v })}
          />,
        ]}
        class="oal-pl-[10px]"
      />
      <Row
        shade
        label="Other"
        toggle={
          <Switch
            on={o.fbmOtherEnabled ?? m.mfnOtherEnabled}
            onChange={(on) => model.setOverrides({ fbmOtherEnabled: on })}
          />
        }
        cells={[
          <MoneyInput
            key="o"
            value={o.fbmOther ?? m.mfnOther}
            inputClass="!oal-h-[26px]"
            onChange={(v) => model.setOverrides({ fbmOther: v ?? 0 })}
          />,
        ]}
        class="oal-pl-[10px]"
      />
      <Row label="Variable Closing Fees" cells={[money2(c.closing)]} class="oal-pl-[10px]" />
      <Row bold shade label="Expenses" cells={[money2(c.expenses)]} />
      <Row
        bold
        label={
          <>
            Buy Cost
            <DiscountChips model={model} />
          </>
        }
        cells={[
          <MoneyInput
            key="b"
            value={(o.discount ?? 0) > 0 ? c.buyCost : model.values.buyFbm}
            decimals={settings.decimalBuyCost}
            inputClass="!oal-h-[26px]"
            onChange={(v) =>
              model.setBuy(
                'fbm',
                v == null ? null : (o.discount ?? 0) > 0 ? v / (1 - (o.discount ?? 0) / 100) : v,
              )
            }
          />,
        ]}
      />
      <Row
        label="Buy Cost Sales Tax"
        toggle={
          <Switch
            on={o.taxEnabled ?? settings.useSalesTax}
            onChange={(on) => model.setOverrides({ taxEnabled: on })}
            title={`${m.salesTax}% (Settings > Sell Price/Buy Cost)`}
          />
        }
        cells={[money2(c.tax)]}
        class="oal-pl-[10px]"
        shade
      />
      <Row
        bold
        label={<span class="oal-text-[15px]">Net</span>}
        cells={[<NetCell key="n" value={c.net} />]}
      />
    </div>
  );
}
