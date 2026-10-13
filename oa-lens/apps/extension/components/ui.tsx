// Small building blocks shared by the widget: popovers, money inputs, switches, pills.
import { evaluateSmartInput } from '@oa-lens/core';
import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function money(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '--';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function plain(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// ---------------------------------------------------------------------------------------------
// Popover: a dropdown under its trigger with an arrow (docs/02 common rules). Opens on click or
// after a 200 ms hover; closes on Esc, outside click and the X button.

const VIEWPORT_MARGIN = 8;

export interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ComponentChildren;
  children: ComponentChildren | ((close: () => void) => ComponentChildren);
  mode?: 'click' | 'hover';
  /** Panel width in px. */
  width?: number;
  title?: ComponentChildren;
  /** Show an X button in the title bar. */
  closable?: boolean;
  class?: string;
  panelClass?: string;
  onOpenChange?: (open: boolean) => void;
}

export function Popover(props: PopoverProps) {
  const { mode = 'click' } = props;
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  const set = useCallback(
    (next: boolean) => {
      setOpen(next);
      props.onOpenChange?.(next);
    },
    [props.onOpenChange],
  );
  const close = useCallback(() => set(false), [set]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (wrap.current && !e.composedPath().includes(wrap.current)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close]);

  // Keep the panel inside the viewport; the arrow stays over the trigger.
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const rect = panel.current.getBoundingClientRect();
    const base = rect.left - shift;
    let next = 0;
    if (base < VIEWPORT_MARGIN) next = VIEWPORT_MARGIN - base;
    else if (base + rect.width > window.innerWidth - VIEWPORT_MARGIN)
      next = window.innerWidth - VIEWPORT_MARGIN - (base + rect.width);
    if (Math.abs(next - shift) > 0.5) setShift(next);
  }, [open, shift]);

  const hover =
    mode === 'hover'
      ? {
          onMouseEnter: () => {
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => set(true), 200);
          },
          onMouseLeave: () => {
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => set(false), 150);
          },
        }
      : {};

  return (
    <span ref={wrap} class={cx('oal-relative oal-inline-flex', props.class)} {...hover}>
      {props.trigger({ open, toggle: () => set(!open) })}
      {open && (
        <div
          ref={panel}
          class={cx(
            'oal-absolute oal-left-1/2 oal-top-full oal-z-[2147483000] oal-mt-[10px] oal-rounded-[8px] oal-border oal-border-[#d5d9d9] oal-bg-white oal-text-left oal-text-[13px] oal-font-normal oal-text-[#0f1111] oal-shadow-[0_4px_16px_rgba(0,0,0,0.18)]',
            props.panelClass,
          )}
          style={{
            width: props.width ? `${props.width}px` : undefined,
            transform: `translateX(calc(-50% + ${shift}px))`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span
            class="oal-absolute oal-top-[-7px] oal-h-[12px] oal-w-[12px] oal-rotate-45 oal-border-l oal-border-t oal-border-[#d5d9d9] oal-bg-white"
            style={{ left: `calc(50% - 6px - ${shift}px)` }}
          />
          {(props.title || props.closable) && (
            <div class="oal-relative oal-flex oal-items-center oal-justify-between oal-px-[12px] oal-pt-[10px]">
              <div class="oal-text-[15px] oal-font-bold">{props.title}</div>
              {props.closable && (
                <button
                  type="button"
                  class="oal-ml-2 oal-text-[18px] oal-leading-none oal-text-[#565959] hover:oal-text-black"
                  onClick={close}
                  aria-label="Close"
                >
                  ×
                </button>
              )}
            </div>
          )}
          <div class="oal-relative">
            {typeof props.children === 'function' ? props.children(close) : props.children}
          </div>
        </div>
      )}
    </span>
  );
}

/** Hover tooltip with plain text, used for short hints. */
export function Hint(props: { text: string; children: ComponentChildren; class?: string }) {
  return (
    <span class={props.class} title={props.text}>
      {props.children}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------

export interface MoneyInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  decimals?: number;
  /** Recalculate while typing (setting "Auto Update/Smart Inputs"). */
  live?: boolean;
  class?: string;
  inputClass?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Show the clear (X) button. */
  clearable?: boolean;
}

/** Number input that accepts expressions like `24.99*0.9` (docs/04 §9). */
export function MoneyInput(props: MoneyInputProps) {
  const decimals = props.decimals ?? 2;
  const format = (v: number | null) => (v == null ? '' : v.toFixed(decimals));
  const [text, setText] = useState(format(props.value));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(format(props.value));
  }, [props.value, decimals]);

  const commit = (raw: string, final: boolean) => {
    if (raw.trim() === '') {
      setInvalid(false);
      props.onChange(null);
      return;
    }
    const v = evaluateSmartInput(raw);
    if (v == null) {
      if (final) setInvalid(true);
      return;
    }
    setInvalid(false);
    const rounded = Number(v.toFixed(decimals));
    props.onChange(rounded);
    if (final) setText(format(rounded));
  };

  return (
    <span class={cx('oal-group oal-relative oal-inline-flex oal-w-full', props.class)}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={props.ariaLabel}
        placeholder={props.placeholder}
        class={cx(
          'oal-h-[30px] oal-w-full oal-rounded-[4px] oal-border oal-bg-white oal-px-[8px] oal-text-right oal-text-[14px] oal-text-[#0f1111] oal-outline-none focus:oal-border-[#007185] focus:oal-shadow-[0_0_0_2px_rgba(0,113,133,0.2)]',
          invalid ? 'oal-border-[#d0021b]' : 'oal-border-[#a6a6a6]',
          props.inputClass,
        )}
        value={text}
        onFocus={() => (focused.current = true)}
        onInput={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          setText(raw);
          if (props.live) commit(raw, false);
        }}
        onBlur={() => {
          focused.current = false;
          commit(text, true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text, true);
          if (e.key === 'Escape') {
            setText(format(props.value));
            setInvalid(false);
          }
        }}
      />
      {props.clearable !== false && props.value != null && props.value !== 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Clear"
          class="oal-absolute oal-left-[4px] oal-top-1/2 oal-hidden oal-h-[16px] oal-w-[16px] -oal-translate-y-1/2 oal-items-center oal-justify-center oal-rounded-full oal-text-[14px] oal-leading-none oal-text-[#8a8a8a] hover:oal-bg-[#eee] group-hover:oal-flex"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setText('');
            props.onChange(null);
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Small on/off switch (fee popup rows, FBM column toggle). */
export function Switch(props: {
  on: boolean;
  onChange: (on: boolean) => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      title={props.title}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.on)}
      class={cx(
        'oal-relative oal-inline-block oal-h-[14px] oal-w-[24px] oal-shrink-0 oal-rounded-full oal-border oal-transition-colors disabled:oal-opacity-40',
        props.on
          ? 'oal-border-[#3d8b37] oal-bg-[#5aa84f]'
          : 'oal-border-[#c7c7c7] oal-bg-[#e3e3e3]',
      )}
    >
      <span
        class={cx(
          'oal-absolute oal-top-[1px] oal-h-[10px] oal-w-[10px] oal-rounded-full oal-shadow oal-transition-all',
          props.on ? 'oal-left-[11px] oal-bg-white' : 'oal-left-[1px] oal-bg-[#8a8a8a]',
        )}
      />
    </button>
  );
}

/** Rounded option chip (Discount 0/5/10…, USPS/$/lb/Flat, Zone 4/5/8). */
export function Chip(props: {
  active?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
  class?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      class={cx(
        'oal-inline-flex oal-h-[20px] oal-items-center oal-rounded-full oal-border oal-px-[8px] oal-text-[11px] oal-leading-none',
        props.active
          ? 'oal-border-[#3d8b37] oal-bg-[#eaf5e8] oal-text-[#2b7a24]'
          : 'oal-border-[#c7c7c7] oal-bg-white oal-text-[#0f1111] hover:oal-bg-[#f3f3f3]',
        props.class,
      )}
    >
      {props.children}
    </button>
  );
}

/** "Targets ⌄" style pill sitting on a divider line. */
export function SectionPill(props: {
  label: string;
  open: boolean;
  onToggle: () => void;
  class?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      class={cx(
        'oal-inline-flex oal-h-[19px] oal-items-center oal-gap-[3px] oal-rounded-full oal-border oal-border-[#c7c7c7] oal-bg-white oal-px-[8px] oal-text-[11px] oal-font-medium oal-text-[#0f1111] hover:oal-bg-[#f3f3f3]',
        props.class,
      )}
    >
      {props.label}
      <span class={cx('oal-text-[9px] oal-transition-transform', props.open && 'oal-rotate-180')}>
        ▼
      </span>
    </button>
  );
}

export function Select<T extends string | number>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  class?: string;
  disabled?: boolean;
}) {
  return (
    <select
      disabled={props.disabled}
      class={cx(
        'oal-h-[22px] oal-rounded-[4px] oal-border oal-border-[#a6a6a6] oal-bg-white oal-px-[2px] oal-text-[12px] oal-font-medium oal-text-[#0f1111]',
        props.class,
      )}
      value={String(props.value)}
      onChange={(e) => {
        const raw = (e.target as HTMLSelectElement).value;
        const match = props.options.find((o) => String(o.value) === raw);
        if (match) props.onChange(match.value);
      }}
    >
      {props.options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Copies text and briefly swaps the tooltip to "Copied" (docs/02 common rules). */
export function CopyText(props: {
  text: string;
  children?: ComponentChildren;
  class?: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <span
      role="button"
      tabIndex={0}
      class={cx('oal-cursor-pointer hover:oal-underline', props.class)}
      title={copied ? 'Copied' : 'Click to Copy'}
      onClick={() => {
        void navigator.clipboard?.writeText(props.text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {props.children ?? props.text}
    </span>
  );
}
