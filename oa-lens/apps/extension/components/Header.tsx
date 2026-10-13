// Header bar: icon buttons on the left, restriction / hazmat badges on the right (docs/02 §A).
import type { RestrictionDTO, RestrictionStatus } from '@oa-lens/shared';
import { Calculator, CircleQuestionMark, Link, Plus, RefreshCw, Settings } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import type { HazmatBadge } from '../lib/hazmatCodes';
import { cx, Popover } from './ui';

function IconButton(props: {
  title: string;
  href?: string;
  onClick?: () => void;
  children: ComponentChildren;
  active?: boolean;
}) {
  const cls = cx(
    'oal-inline-flex oal-h-[22px] oal-w-[22px] oal-items-center oal-justify-center oal-rounded-[4px] oal-text-[#555] hover:oal-bg-[#e3e3e3] hover:oal-text-black',
    props.active && 'oal-bg-[#e3e3e3]',
  );
  return props.href ? (
    <a class={cls} href={props.href} target="_blank" rel="noreferrer" title={props.title}>
      {props.children}
    </a>
  ) : (
    <button type="button" class={cls} title={props.title} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

/** Camel silhouette (our own drawing). */
function CamelIcon() {
  return (
    <svg width="17" height="15" viewBox="0 0 24 20" fill="currentColor" aria-hidden="true">
      <path d="M21.5 4.2c-.6-.5-1.4-.6-2-.2l-.6.4c-.4.3-.6.8-.6 1.3v1.6c0 .6-.5 1.1-1.1 1.1-.5 0-.9-.3-1.1-.8l-.7-2.2c-.3-.9-1.1-1.5-2-1.5s-1.7.6-2 1.4l-.3.8c-.2.5-.7.9-1.2.9s-1-.4-1.2-.9l-.4-1c-.4-.9-1.2-1.4-2.2-1.4-1.3 0-2.4 1.1-2.4 2.4v3.1c0 1 .5 2 1.3 2.6v5.4h1.6v-4.6h.8v4.6H7v-4.3c.5.1 1.1.2 1.6.2h4.5v4.1h1.6v-4.1h.8v4.1h1.6v-5.3c.9-.6 1.5-1.6 1.5-2.7v-.9c1-.2 1.8-1 1.9-2l.2-2.1.9-.4c.7-.3 1-1.1.6-1.8z" />
    </svg>
  );
}

export function Logo() {
  return (
    <span class="oal-select-none oal-font-bold oal-leading-none oal-tracking-[-0.5px]">
      <span class="oal-text-[13px] oal-text-[#3d8b37]">O</span>
      <span class="oal-text-[10px] oal-text-[#555]">A</span>
    </span>
  );
}

const STATUS_LABEL: Record<RestrictionStatus, string> = {
  sell: 'Sell',
  approval: 'Appr',
  restricted: 'Rstr',
  unknown: '--',
};

function badgeClass(kind: 'green' | 'orange' | 'red' | 'yellow' | 'gray') {
  return {
    green: 'oal-border-[#4a9a3f] oal-bg-[#e8f5e3] oal-text-[#2f7d22]',
    orange: 'oal-border-[#e47911] oal-bg-[#fff1e3] oal-text-[#c45500]',
    red: 'oal-border-[#d0021b] oal-bg-[#fde8ea] oal-text-[#c40000]',
    yellow: 'oal-border-[#d4b106] oal-bg-[#fff9c4] oal-text-[#8a6d00]',
    gray: 'oal-border-[#8a8a8a] oal-bg-[#f0f0f0] oal-text-[#555]',
  }[kind];
}

export function Badge(props: {
  kind: 'green' | 'orange' | 'red' | 'yellow' | 'gray';
  children: ComponentChildren;
  title?: string;
  class?: string;
}) {
  return (
    <span
      title={props.title}
      class={cx(
        'oal-inline-flex oal-h-[19px] oal-items-center oal-rounded-[3px] oal-border oal-px-[5px] oal-text-[11px] oal-font-bold oal-leading-none',
        badgeClass(props.kind),
        props.class,
      )}
    >
      {props.children}
    </span>
  );
}

const statusKind = (s: RestrictionStatus) =>
  s === 'sell' ? 'green' : s === 'approval' ? 'orange' : s === 'restricted' ? 'red' : 'gray';

const USED_LABELS: Record<string, string> = {
  used_like_new: 'Like New',
  used_very_good: 'Very Good',
  used_good: 'Good',
  used_acceptable: 'Acceptable',
};

/** Worst status first: Rstr > Appr > Sell. */
function overallStatus(list: RestrictionDTO[]): RestrictionStatus {
  for (const s of ['restricted', 'approval', 'sell'] as const) {
    if (list.some((r) => r.status === s)) return s;
  }
  return 'unknown';
}

function RestrictionBadge(props: {
  asin: string;
  restrictions: RestrictionDTO[];
  used: boolean;
  onRefresh: () => void;
}) {
  const status = overallStatus(props.restrictions);
  const approval = props.restrictions
    .flatMap((r) => r.reasons)
    .flatMap((r) => r.links)
    .find((l) => l.url)?.url;
  const addProduct = `https://sellercentral.amazon.com/product-search/search?q=${props.asin}`;
  const sellingApp = `https://sellercentral.amazon.com/hz/approvalrequest/restrictions/approve?asin=${props.asin}`;
  const rows: [RestrictionStatus, string][] = [
    ['sell', 'You can sell'],
    ['approval', 'Request approval to sell'],
    ['restricted', 'Cannot apply to sell'],
  ];
  return (
    <span class="oal-group oal-inline-flex oal-items-center">
      <button
        type="button"
        title="Re-check restrictions"
        class="oal-mr-[2px] oal-hidden oal-text-[#888] hover:oal-text-black group-hover:oal-inline-flex"
        onClick={props.onRefresh}
      >
        <RefreshCw size={12} />
      </button>
      <Popover
        mode="hover"
        width={290}
        trigger={() => (
          <a href={approval ?? addProduct} target="_blank" rel="noreferrer">
            <Badge kind={statusKind(status)}>{STATUS_LABEL[status]}</Badge>
          </a>
        )}
      >
        <div class="oal-px-[16px] oal-py-[12px] oal-text-[13px]">
          <div class="oal-font-bold">Seller Central Links</div>
          <div class="oal-mb-[10px] oal-flex oal-gap-[8px] oal-text-[#007185]">
            <a class="hover:oal-underline" href={addProduct} target="_blank" rel="noreferrer">
              Add a Product
            </a>
            <span class="oal-text-[#ccc]">|</span>
            <a class="hover:oal-underline" href={sellingApp} target="_blank" rel="noreferrer">
              Selling App
            </a>
          </div>
          {props.used
            ? props.restrictions.map((r) => (
                <div
                  key={r.conditionType}
                  class="oal-flex oal-items-center oal-gap-[8px] oal-py-[3px]"
                >
                  <Badge kind={statusKind(r.status)}>{STATUS_LABEL[r.status]}</Badge>
                  <span class="oal-font-bold">
                    {USED_LABELS[r.conditionType] ?? r.conditionType}
                  </span>
                  <span class="oal-text-[#565959]">{r.reasons[0]?.message ?? ''}</span>
                </div>
              ))
            : rows.map(([s, text]) => (
                <div key={s} class="oal-flex oal-items-center oal-gap-[8px] oal-py-[4px]">
                  <Badge kind={statusKind(s)}>{STATUS_LABEL[s]}</Badge>
                  <span class="oal-text-[#888]">-</span>
                  <span
                    class={cx(s === status ? 'oal-font-bold oal-text-black' : 'oal-text-[#565959]')}
                  >
                    {text}
                  </span>
                </div>
              ))}
          {!props.used &&
            props.restrictions
              .flatMap((r) => r.reasons)
              .map((r, i) => (
                <div key={i} class="oal-mt-[6px] oal-text-[12px] oal-text-[#565959]">
                  {r.message}
                </div>
              ))}
        </div>
      </Popover>
    </span>
  );
}

function HazBadge({ hazmat }: { hazmat: Exclude<HazmatBadge, null> }) {
  const rows: [Exclude<HazmatBadge, null>, ComponentChildren][] = [
    ['red', 'Hazmat'],
    [
      'yellow',
      'Hazmat, but you may still be able to send to FBA even if you don’t have a Hazmat approved selling account (with some restrictions - for example you may need to send to a specific fulfillment center).',
    ],
    ['review', 'ASIN is in Hazmat Review'],
  ];
  const label = (h: Exclude<HazmatBadge, null>) => (h === 'review' ? 'Rvw' : 'Haz');
  const kind = (h: Exclude<HazmatBadge, null>) =>
    h === 'red' ? 'red' : h === 'yellow' ? 'yellow' : 'gray';
  return (
    <Popover
      mode="hover"
      width={290}
      trigger={() => (
        <a
          href="https://sellercentral.amazon.com/gp/help/help.html?itemID=201003400"
          target="_blank"
          rel="noreferrer"
        >
          <Badge kind={kind(hazmat)}>{label(hazmat)}</Badge>
        </a>
      )}
    >
      <div class="oal-px-[16px] oal-py-[12px] oal-text-[13px]">
        {rows.map(([h, text]) => (
          <div key={h} class="oal-flex oal-items-start oal-gap-[8px] oal-py-[5px]">
            <Badge kind={kind(h)} class="oal-shrink-0">
              {label(h)}
            </Badge>
            <span class="oal-text-[#888]">-</span>
            <span class={cx(h === hazmat ? 'oal-font-bold oal-text-black' : 'oal-text-[#565959]')}>
              {text}
            </span>
          </div>
        ))}
      </div>
    </Popover>
  );
}

function LinksPopup({ asin, title, upc }: { asin: string; title: string; upc: string | null }) {
  const t6 = title.split(/\s+/).slice(0, 6).join(' ');
  const enc = encodeURIComponent;
  const offers = (q: string) => `https://www.amazon.com/dp/${asin}/?aod=1${q}`;
  const groups: [string, [string, string | null][]][] = [
    [
      'Amazon',
      [
        ['All Offers (new)', offers('&condition=new')],
        ['All Offers (used)', offers('&condition=used')],
        ['All Offers', offers('')],
        ['Main Product Page', `https://www.amazon.com/dp/${asin}`],
        ['Reviews - Most Recent', `https://www.amazon.com/product-reviews/${asin}/?sortBy=recent`],
      ],
    ],
    [
      'External',
      [
        ['Ebay UPC', upc ? `https://www.ebay.com/sch/i.html?_nkw=${enc(upc)}` : null],
        ['Ebay Title (first 6 words)', `https://www.ebay.com/sch/i.html?_nkw=${enc(t6)}`],
        ['Google UPC', upc ? `https://www.google.com/search?q=${enc(upc)}` : null],
        ['Google Title (first 6 words)', `https://www.google.com/search?q=${enc(t6)}`],
        ['Walmart UPC', upc ? `https://www.walmart.com/search/?query=${enc(upc)}` : null],
        ['Walmart Title (first 6 words)', `https://www.walmart.com/search/?query=${enc(t6)}`],
      ],
    ],
  ];
  return (
    <div class="oal-grid oal-grid-cols-2 oal-gap-[12px] oal-px-[14px] oal-py-[10px] oal-text-[13px]">
      {groups.map(([name, links]) => (
        <div key={name}>
          <div class="oal-mb-[4px] oal-font-bold">{name}</div>
          {links
            .filter((l): l is [string, string] => l[1] != null)
            .map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                class="oal-block oal-py-[2px] oal-text-[#007185] hover:oal-underline"
              >
                {label}
              </a>
            ))}
        </div>
      ))}
    </div>
  );
}

export interface HeaderProps {
  asin: string;
  title: string;
  upc: string | null;
  restrictions: RestrictionDTO[] | null;
  restrictionsError: boolean;
  used: boolean;
  hazmat: HazmatBadge;
  transparency: boolean;
  onSettings: () => void;
  onOptions: () => void;
  onRefreshRestrictions: () => void;
}

export function Header(props: HeaderProps) {
  const { asin } = props;
  return (
    <div class="oal-flex oal-h-[30px] oal-items-center oal-justify-between oal-rounded-t-[6px] oal-border-b oal-border-[#ddd] oal-bg-gradient-to-b oal-from-[#fafafa] oal-to-[#ececec] oal-px-[8px]">
      <div class="oal-flex oal-items-center oal-gap-[3px]">
        <IconButton title="OA Lens options" onClick={props.onOptions}>
          <Logo />
        </IconButton>
        <IconButton title="Settings" onClick={props.onSettings}>
          <Settings size={15} />
        </IconButton>
        <IconButton title="camelcamelcamel" href={`https://camelcamelcamel.com/product/${asin}`}>
          <CamelIcon />
        </IconButton>
        <IconButton title="Keepa" href={`https://keepa.com/#!product/1-${asin}`}>
          <Plus size={16} strokeWidth={3.5} />
        </IconButton>
        <IconButton
          title="Amazon Revenue Calculator"
          href={`https://sellercentral.amazon.com/revcal?asin=${asin}`}
        >
          <Calculator size={15} />
        </IconButton>
        <Popover
          width={430}
          trigger={({ toggle, open }) => (
            <IconButton title="Links" onClick={toggle} active={open}>
              <Link size={15} />
            </IconButton>
          )}
        >
          <LinksPopup asin={asin} title={props.title} upc={props.upc} />
        </Popover>
        <Popover
          width={300}
          trigger={({ toggle, open }) => (
            <IconButton title="Help" onClick={toggle} active={open}>
              <CircleQuestionMark size={15} />
            </IconButton>
          )}
        >
          <div class="oal-px-[14px] oal-py-[10px] oal-text-[13px] oal-leading-snug">
            <div class="oal-mb-[4px] oal-font-bold">OA Lens</div>
            <p>
              Fees come from your SP-API app (today&apos;s quotes) and Amazon&apos;s 2026 fee
              tables.
            </p>
            <p class="oal-mt-[4px] oal-text-[#565959]">
              Click a Net value&apos;s arrow for the fee breakdown. Inputs accept math like
              24.99*0.9.
            </p>
          </div>
        </Popover>
      </div>
      <div class="oal-flex oal-items-center oal-gap-[5px]">
        {props.hazmat && <HazBadge hazmat={props.hazmat} />}
        {props.transparency && (
          <Badge kind="red" title="This ASIN requires transparency codes.">
            Tp
          </Badge>
        )}
        {props.restrictions ? (
          <RestrictionBadge
            asin={asin}
            restrictions={props.restrictions}
            used={props.used}
            onRefresh={props.onRefreshRestrictions}
          />
        ) : props.restrictionsError ? (
          <button
            type="button"
            title="Retry restriction check"
            onClick={props.onRefreshRestrictions}
          >
            <Badge kind="gray">
              <RefreshCw size={11} />
            </Badge>
          </button>
        ) : (
          <span class="oal-h-[19px] oal-w-[32px] oal-animate-pulse oal-rounded-[3px] oal-bg-[#e3e3e3]" />
        )}
      </div>
    </div>
  );
}
