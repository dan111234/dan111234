// Safe arithmetic for price/cost inputs such as "24.99*0.9" (docs/04 §9). No eval.
//
// Grammar:  expr   := term (('+' | '-') term)*
//           term   := power (('*' | '/') power)*
//           power  := unary ('^' power)?
//           unary  := ('+' | '-') unary | postfix
//           postfix:= primary '%'*
//           primary:= number | '(' expr ')'
// "%" is percent (x% = x/100), with the calculator rule that `a + b%` / `a - b%` mean a ± a·b/100.

type Token = { type: 'num'; value: number } | { type: 'op'; value: string };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  const s = input.replace(/[$,\s]/g, '');
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if ('+-*/%^()'.includes(c)) {
      tokens.push({ type: 'op', value: c });
      i++;
      continue;
    }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) return null;
    tokens.push({ type: 'num', value: Number(m[1]) });
    i += m[1]!.length;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private isOp(value: string): boolean {
    const t = this.peek();
    return t?.type === 'op' && t.value === value;
  }

  parse(): number {
    const v = this.expr();
    if (this.pos !== this.tokens.length) throw new Error('trailing input');
    return v;
  }

  private expr(): number {
    let left = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.pos++] as { value: string }).value;
      const { value, percent } = this.termWithPercent();
      const right = percent ? (left * value) / 100 : value;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  /** A term on the right of +/-: a bare "b%" keeps its percent meaning for the calculator rule. */
  private termWithPercent(): { value: number; percent: boolean } {
    const start = this.pos;
    const value = this.term();
    const consumed = this.tokens.slice(start, this.pos);
    const last = consumed.at(-1);
    const bare =
      consumed.length === 2 &&
      consumed[0]!.type === 'num' &&
      last?.type === 'op' &&
      last.value === '%';
    return bare ? { value: value * 100, percent: true } : { value, percent: false };
  }

  private term(): number {
    let left = this.power();
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.tokens[this.pos++] as { value: string }).value;
      const right = this.power();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private power(): number {
    const base = this.unary();
    if (this.isOp('^')) {
      this.pos++;
      return base ** this.power();
    }
    return base;
  }

  private unary(): number {
    if (this.isOp('-')) {
      this.pos++;
      return -this.unary();
    }
    if (this.isOp('+')) {
      this.pos++;
      return this.unary();
    }
    return this.postfix();
  }

  private postfix(): number {
    let v = this.primary();
    while (this.isOp('%')) {
      this.pos++;
      v /= 100;
    }
    return v;
  }

  private primary(): number {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error('unexpected end');
    if (t.type === 'num') return t.value;
    if (t.value === '(') {
      const v = this.expr();
      if (!this.isOp(')')) throw new Error('missing )');
      this.pos++;
      return v;
    }
    throw new Error(`unexpected ${t.value}`);
  }
}

/** Evaluates a smart input. null when the text is not a valid expression or not finite. */
export function evaluateSmartInput(text: string): number | null {
  const tokens = tokenize(text);
  if (!tokens || tokens.length === 0) return null;
  try {
    const v = new Parser(tokens).parse();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
