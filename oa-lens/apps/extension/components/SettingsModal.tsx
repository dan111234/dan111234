// Settings popup (docs/02 §K-5, docs/05). Values save as soon as they change.
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type MarketSettings,
  type Settings,
} from '@oa-lens/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { cx, MoneyInput, Select } from './ui';

export type SettingsTab = 'fba' | 'fbm' | 'sellbuy' | 'roi' | 'targets' | 'general' | 'display';

const TABS: [SettingsTab, string][] = [
  ['fba', 'FBA'],
  ['fbm', 'FBM'],
  ['sellbuy', 'Sell Price/Buy Cost'],
  ['roi', 'ROI-Margin'],
  ['targets', 'Targets'],
  ['general', 'General'],
  ['display', 'Display'],
];

interface Props {
  settings: Settings;
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  onChange: (next: Settings) => void;
  onClose: () => void;
}

function Field(props: { label: ComponentChildren; hint?: string; children: ComponentChildren }) {
  return (
    <div class="oal-flex oal-items-center oal-justify-between oal-gap-[12px] oal-border-b oal-border-[#f0f0f0] oal-py-[7px]">
      <span class="oal-text-[13px]" title={props.hint}>
        {props.label}
        {props.hint && <span class="oal-ml-[4px] oal-cursor-help oal-text-[#888]">ⓘ</span>}
      </span>
      <span class="oal-flex oal-shrink-0 oal-items-center oal-gap-[6px]">{props.children}</span>
    </div>
  );
}

function Check(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label class="oal-inline-flex oal-cursor-pointer oal-items-center oal-gap-[4px] oal-text-[12px]">
      <input
        type="checkbox"
        class="oal-h-[14px] oal-w-[14px] oal-accent-[#3d8b37]"
        checked={props.checked}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
      />
      {props.label}
    </label>
  );
}

function Num(props: {
  value: number;
  onChange: (v: number) => void;
  width?: number;
  decimals?: number;
}) {
  return (
    <span style={{ width: `${props.width ?? 80}px` }}>
      <MoneyInput
        value={props.value}
        decimals={props.decimals ?? 2}
        clearable={false}
        inputClass="!oal-h-[24px] !oal-text-[13px]"
        onChange={(v) => props.onChange(v ?? 0)}
      />
    </span>
  );
}

function Radio<T extends string | number>(props: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <span class="oal-flex oal-flex-wrap oal-gap-[10px]">
      {props.options.map(([v, label]) => (
        <label
          key={String(v)}
          class="oal-inline-flex oal-cursor-pointer oal-items-center oal-gap-[3px] oal-text-[12px]"
        >
          <input
            type="radio"
            class="oal-accent-[#3d8b37]"
            checked={props.value === v}
            onChange={() => props.onChange(v)}
          />
          {label}
        </label>
      ))}
    </span>
  );
}

const REGIONS: [MarketSettings['fbaInboundPlacementRegion'], string][] = [
  ['west', 'West'],
  ['central', 'Central'],
  ['east', 'East'],
];

export function SettingsModal(props: Props) {
  const s = props.settings;
  const m = s.us;
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<Settings>) => {
    props.onChange({ ...s, ...patch });
    setSaved(true);
  };
  const setM = (patch: Partial<MarketSettings>) => set({ us: { ...m, ...patch } });

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 1200);
    return () => window.clearTimeout(t);
  }, [saved, s]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [props.onClose]);

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'oa-lens-settings.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importSettings = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        props.onChange(mergeSettings(JSON.parse(await file.text())));
        setSaved(true);
      } catch {
        window.alert('This file is not an OA Lens settings file.');
      }
    };
    input.click();
  };

  let body: ComponentChildren;
  switch (props.tab) {
    case 'fba':
      body = (
        <>
          <Field
            label="Ship to FBA $/lb › Use dimensional weight"
            hint="Uses the larger of unit weight and dimensional weight. Most sellers leave this off."
          >
            <Check checked={m.fbaInboundUseDim} onChange={(v) => setM({ fbaInboundUseDim: v })} />
          </Field>
          <Field label="Normal $/lb">
            <Check checked={m.fbaInboundEnabled} onChange={(v) => setM({ fbaInboundEnabled: v })} />
            <Num value={m.fbaInbound} onChange={(v) => setM({ fbaInbound: v })} />
          </Field>
          <Field label="Hazmat $/lb">
            <Check
              checked={m.fbaInboundHazmatEnabled}
              onChange={(v) => setM({ fbaInboundHazmatEnabled: v })}
            />
            <Num value={m.fbaInboundHazmat} onChange={(v) => setM({ fbaInboundHazmat: v })} />
          </Field>
          <Field
            label="Prep chips"
            hint="Click a chip to turn it on by default. Edit names (6 letters) and amounts."
          >
            <Check checked={m.fbaExtrasEnabled} onChange={(v) => setM({ fbaExtrasEnabled: v })} />
          </Field>
          <div class="oal-grid oal-grid-cols-2 oal-gap-[6px] oal-py-[6px]">
            {m.fbaExtrasChips.map((chip, i) => (
              <span key={chip.id} class="oal-flex oal-items-center oal-gap-[4px]">
                <Check
                  checked={m.fbaExtrasDefaultOn.includes(chip.id)}
                  onChange={(on) =>
                    setM({
                      fbaExtrasDefaultOn: on
                        ? [...m.fbaExtrasDefaultOn, chip.id]
                        : m.fbaExtrasDefaultOn.filter((x) => x !== chip.id),
                    })
                  }
                />
                <input
                  class="oal-h-[24px] oal-w-[70px] oal-rounded-[4px] oal-border oal-border-[#a6a6a6] oal-px-[4px] oal-text-[12px]"
                  maxLength={6}
                  value={chip.label}
                  onChange={(e) => {
                    const chips = [...m.fbaExtrasChips];
                    chips[i] = { ...chip, label: (e.target as HTMLInputElement).value.slice(0, 6) };
                    setM({ fbaExtrasChips: chips });
                  }}
                />
                <Num
                  width={64}
                  value={chip.amount}
                  onChange={(v) => {
                    const chips = [...m.fbaExtrasChips];
                    chips[i] = { ...chip, amount: v };
                    setM({ fbaExtrasChips: chips });
                  }}
                />
              </span>
            ))}
          </div>
          <Field label="Other">
            <Check checked={m.fbaOtherEnabled} onChange={(v) => setM({ fbaOtherEnabled: v })} />
            <Num value={m.fbaOther} onChange={(v) => setM({ fbaOther: v })} />
          </Field>
          <Field label="Monthly Storage (months)">
            <Check checked={m.fbaCalcStorageFee} onChange={(v) => setM({ fbaCalcStorageFee: v })} />
            <Select
              value={m.storageMonths}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i + 1,
                label: String(i + 1),
              }))}
              onChange={(v) => setM({ storageMonths: v })}
            />
          </Field>
          <Field label="Inbound Placement: Standard Size Tiers">
            <Check
              checked={m.fbaInboundPlacementStandardEnabled}
              onChange={(v) => setM({ fbaInboundPlacementStandardEnabled: v })}
            />
            <Radio
              value={m.fbaInboundPlacementStandardRegion}
              options={REGIONS}
              onChange={(v) => setM({ fbaInboundPlacementStandardRegion: v })}
            />
            <Radio
              value={m.fbaInboundPlacementStandardLocation}
              options={[
                [1, '1'],
                [5, '5+'],
              ]}
              onChange={(v) => setM({ fbaInboundPlacementStandardLocation: v })}
            />
          </Field>
          <Field label="Inbound Placement: Bulky Size Tiers">
            <Check
              checked={m.fbaInboundPlacementEnabled}
              onChange={(v) => setM({ fbaInboundPlacementEnabled: v })}
            />
            <Radio
              value={m.fbaInboundPlacementRegion}
              options={REGIONS}
              onChange={(v) => setM({ fbaInboundPlacementRegion: v })}
            />
            <Radio
              value={m.fbaInboundPlacementLocation}
              options={[
                [1, '1'],
                [2, '2'],
                [3, '3'],
                [5, '5+'],
              ]}
              onChange={(v) => setM({ fbaInboundPlacementLocation: v })}
            />
          </Field>
          <Field label="Low Inventory Fee - Historical Days of Supply">
            <Check
              checked={m.fbaLowInventoryEnabled}
              onChange={(v) => setM({ fbaLowInventoryEnabled: v })}
            />
            <Select
              value={m.fbaLowInventoryPeriod}
              options={(['select', '0-14', '14-21', '21-28', '28+'] as const).map((v) => ({
                value: v,
                label: v === 'select' ? 'Select' : v,
              }))}
              onChange={(v) => setM({ fbaLowInventoryPeriod: v })}
            />
          </Field>
        </>
      );
      break;
    case 'fbm':
      body = (
        <>
          <Field label="Ship revenue (included in the FBM sell price)">
            <Check checked={m.mfnShipRevEnabled} onChange={(v) => setM({ mfnShipRevEnabled: v })} />
            <Num value={m.mfnShipRev} onChange={(v) => setM({ mfnShipRev: v })} />
          </Field>
          <Field label="Other">
            <Check checked={m.mfnOtherEnabled} onChange={(v) => setM({ mfnOtherEnabled: v })} />
            <Num value={m.mfnOther} onChange={(v) => setM({ mfnOther: v })} />
          </Field>
          <Field label="FBM ship estimate">
            <Check checked={m.mfnShipEstimate} onChange={(v) => setM({ mfnShipEstimate: v })} />
            <Radio
              value={m.mfnShipEstimateMethod}
              options={[
                ['pound', '$/pound'],
                ['flat', 'Flat Rate'],
                ['usps', 'USPS'],
              ]}
              onChange={(v) => setM({ mfnShipEstimateMethod: v })}
            />
          </Field>
          <Field label="$/pound">
            <Num value={m.mfnShipPoundPrice} onChange={(v) => setM({ mfnShipPoundPrice: v })} />
          </Field>
          <Field label="Flat Rate">
            <Num value={m.mfnShipFlatRate} onChange={(v) => setM({ mfnShipFlatRate: v })} />
          </Field>
          <Field label="USPS service">
            <Radio
              value={m.mfnUSPSMethod}
              options={[
                ['ground_advantage', 'Ground Advantage'],
                ['priority', 'Priority'],
                ['media_mail', 'Media Mail'],
              ]}
              onChange={(v) => setM({ mfnUSPSMethod: v })}
            />
          </Field>
          <Field label="USPS Ship Zone" hint="Zone 4 is closer and a little cheaper.">
            <Radio
              value={m.mfnShipZone}
              options={[
                [4, '4'],
                [5, '5'],
                [8, '8'],
              ]}
              onChange={(v) => setM({ mfnShipZone: v })}
            />
          </Field>
          <Field label="Use Priority for Hazmat">
            <Check
              checked={m.mfnUSPSUsePriorityForHazmat}
              onChange={(v) => setM({ mfnUSPSUsePriorityForHazmat: v })}
            />
          </Field>
          <Field label="Always Use Priority">
            <Check
              checked={m.mfnUSPSAlwaysUsePriority}
              onChange={(v) => setM({ mfnUSPSAlwaysUsePriority: v })}
            />
          </Field>
        </>
      );
      break;
    case 'sellbuy':
      body = (
        <>
          <Field label="Default Sell Price - FBM">
            <Select
              value={s.sellPriceOrderFBM}
              options={[
                { value: 'buybox_lowprice', label: 'Buy Box then Low New' },
                { value: 'lowfba_buybox_lowprice', label: 'Low FBA then Buy Box then Low New' },
                { value: 'lowfbm_buybox_lowprice', label: 'Low FBM then Buy Box then Low New' },
              ]}
              onChange={(v) => set({ sellPriceOrderFBM: v })}
            />
          </Field>
          <Field label="Default Sell Price - FBA">
            <Select
              value={s.sellPriceOrderFBA}
              options={[
                { value: 'buybox_lowprice', label: 'Buy Box then Low New' },
                { value: 'lowfba_buybox_lowprice', label: 'Low FBA then Buy Box then Low New' },
              ]}
              onChange={(v) => set({ sellPriceOrderFBA: v })}
            />
          </Field>
          <Field label="Buy Cost Sales Tax %">
            <Check
              checked={s.useSalesTax}
              onChange={(v) => set({ useSalesTax: v })}
              label="On by default"
            />
            <Num value={m.salesTax} onChange={(v) => setM({ salesTax: v })} />
          </Field>
          <Field label="Buy Cost decimal places">
            <Radio
              value={s.decimalBuyCost}
              options={([2, 3, 4, 5, 6] as const).map((d) => [d, String(d)] as [typeof d, string])}
              onChange={(v) => set({ decimalBuyCost: v })}
            />
          </Field>
          <Field label="Buy Cost - Use List Price">
            <Check checked={s.useListPrice} onChange={(v) => set({ useListPrice: v })} />
          </Field>
          <Field label="Save Buy Cost">
            <Check checked={s.saveBuycost} onChange={(v) => set({ saveBuycost: v })} />
          </Field>
          <div class="oal-mt-[10px] oal-font-bold">Max Buy Cost Rules</div>
          <p class="oal-mb-[4px] oal-text-[12px] oal-text-[#565959]">
            Max Cost is the highest buy cost that meets every rule. 0 turns a rule off.
          </p>
          <Field label="Show in search results for">
            <Radio
              value={s.maxBuyCostType}
              options={[
                ['fba', 'FBA'],
                ['fbm', 'FBM'],
              ]}
              onChange={(v) => set({ maxBuyCostType: v })}
            />
          </Field>
          {(
            [
              ['FBA', 'maxBuyCostFBAByNet', 'maxBuyCostFBAByROI', 'maxBuyCostFBAByMargin'],
              ['FBM', 'maxBuyCostMFNByNet', 'maxBuyCostMFNByROI', 'maxBuyCostMFNByMargin'],
            ] as const
          ).map(([name, net, roi, margin]) => (
            <Field key={name} label={name}>
              <span class="oal-text-[12px]">Net ≥ $</span>
              <Num width={60} value={s[net]} onChange={(v) => set({ [net]: v })} />
              <span class="oal-text-[12px]">ROI ≥ %</span>
              <Num width={60} decimals={0} value={s[roi]} onChange={(v) => set({ [roi]: v })} />
              <span class="oal-text-[12px]">Margin ≥ %</span>
              <Num
                width={60}
                decimals={0}
                value={s[margin]}
                onChange={(v) => set({ [margin]: v })}
              />
            </Field>
          ))}
        </>
      );
      break;
    case 'roi':
      body = (
        <>
          <p class="oal-mb-[6px] oal-text-[12px] oal-text-[#565959]">
            The numerator is always Net profit; only the denominator changes.
          </p>
          <Field label="ROI Method">
            <Select
              value={s.roiMethod}
              options={[
                { value: 'buyCostOnly', label: 'Buy Cost (+ tax)' },
                { value: 'buyCost_Other_Inbound', label: 'Buy Cost + Other + Inbound shipping' },
                { value: 'allFees', label: 'Buy Cost + all fees' },
              ]}
              onChange={(v) => set({ roiMethod: v })}
            />
          </Field>
          <Field label="ROI and Margin decimal places">
            <Radio
              value={s.decimalProfit}
              options={[
                [0, '0'],
                [1, '1'],
                [2, '2'],
              ]}
              onChange={(v) => set({ decimalProfit: v })}
            />
          </Field>
          <Field label="Show ROI and Margin at bottom">
            <Check checked={s.alwaysShowROI} onChange={(v) => set({ alwaysShowROI: v })} />
          </Field>
        </>
      );
      break;
    case 'targets':
      body = (
        <>
          {(
            [
              ['Sell Price Estimate for Target Profits ($)', 'profitPriceTargets'],
              ['Sell Price / Buy Cost Est. for Target ROI (%)', 'roiPriceTargets'],
              ['Sell Price / Buy Cost Est. for Target Margin (%)', 'marginPriceTargets'],
            ] as const
          ).map(([label, key]) => (
            <Field key={key} label={label}>
              <input
                class="oal-h-[24px] oal-w-[160px] oal-rounded-[4px] oal-border oal-border-[#a6a6a6] oal-px-[6px] oal-text-[13px]"
                value={s[key]}
                onChange={(e) => {
                  const v = (e.target as HTMLInputElement).value;
                  if (/^\s*\d+(\.\d+)?(\s*,\s*\d+(\.\d+)?)*\s*$/.test(v)) set({ [key]: v });
                }}
              />
            </Field>
          ))}
        </>
      );
      break;
    case 'general':
      body = (
        <>
          <Field label="Default Offer Condition">
            <Radio
              value={s.defaultCondition}
              options={[
                ['new', 'New'],
                ['used', 'Used'],
              ]}
              onChange={(v) => set({ defaultCondition: v })}
            />
          </Field>
          <Field label="Offers within % FBA">
            <Radio
              value={s.closeFBAPercent}
              options={[
                [1, '1%'],
                [2, '2%'],
                [3, '3%'],
              ]}
              onChange={(v) => set({ closeFBAPercent: v })}
            />
          </Field>
          <Field label="Use Peak fees for the main Net">
            <Check checked={s.usePeakFees} onChange={(v) => set({ usePeakFees: v })} />
          </Field>
          <Field
            label="Auto Update/Smart Inputs"
            hint="Recalculate while typing. Inputs accept math like 24.99*0.9."
          >
            <Check checked={s.smartInput} onChange={(v) => set({ smartInput: v })} />
          </Field>
          <Field label="Hide FBM column">
            <Check checked={s.hideFBMColumn} onChange={(v) => set({ hideFBMColumn: v })} />
          </Field>
        </>
      );
      break;
    case 'display':
      body = (
        <Field label="Font Size">
          <Radio
            value={s.displayFontSize}
            options={[
              ['smaller', 'Smaller'],
              ['small', 'Small'],
              ['default', 'Default'],
              ['large', 'Large'],
              ['larger', 'Larger'],
            ]}
            onChange={(v) => set({ displayFontSize: v })}
          />
        </Field>
      );
      break;
  }

  return (
    <div
      class="oal-fixed oal-inset-0 oal-z-[2147483600] oal-flex oal-items-center oal-justify-center oal-bg-black/40"
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}
    >
      <div class="oal-flex oal-h-[min(560px,90vh)] oal-w-[min(820px,95vw)] oal-flex-col oal-overflow-hidden oal-rounded-[8px] oal-bg-white oal-text-[13px] oal-text-[#0f1111] oal-shadow-2xl">
        <div class="oal-flex oal-items-center oal-justify-between oal-border-b oal-border-[#ddd] oal-px-[16px] oal-py-[10px]">
          <div class="oal-text-[16px] oal-font-bold">OA Lens Settings</div>
          <div class="oal-flex oal-items-center oal-gap-[10px] oal-text-[12px]">
            {saved && <span class="oal-text-[#3d8b37]">Done</span>}
            <button
              type="button"
              class="oal-text-[#007185] hover:oal-underline"
              onClick={exportSettings}
            >
              Export
            </button>
            <button
              type="button"
              class="oal-text-[#007185] hover:oal-underline"
              onClick={importSettings}
            >
              Import
            </button>
            <button
              type="button"
              class="oal-text-[#007185] hover:oal-underline"
              onClick={() => {
                if (window.confirm('Reset all settings to the defaults?')) {
                  props.onChange(DEFAULT_SETTINGS);
                  setSaved(true);
                }
              }}
            >
              Reset
            </button>
            <button
              type="button"
              class="oal-text-[20px] oal-leading-none"
              onClick={props.onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div class="oal-px-[16px] oal-pt-[4px] oal-text-[11px] oal-text-[#565959]">
          Settings don&apos;t sync across devices. Use Export/Import to copy them.
        </div>
        <div class="oal-flex oal-min-h-0 oal-flex-1">
          <nav class="oal-w-[170px] oal-shrink-0 oal-border-r oal-border-[#eee] oal-py-[6px]">
            {TABS.map(([id, label]) => (
              <button
                type="button"
                key={id}
                class={cx(
                  'oal-block oal-w-full oal-px-[14px] oal-py-[7px] oal-text-left',
                  props.tab === id
                    ? 'oal-bg-[#eaf5e8] oal-font-bold oal-text-[#2b7a24]'
                    : 'hover:oal-bg-[#f5f5f5]',
                )}
                onClick={() => props.onTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div class="oal-min-w-0 oal-flex-1 oal-overflow-y-auto oal-px-[16px] oal-py-[8px]">
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
