/**
 * Canvas scene for the "token journey" section, drawn in the site's receipt language: flat
 * paper shapes, ink outlines, one stamp red. The payment is a red coin. Whenever it moves it
 * breaks into printer dots, and it re-forms as whatever it has become.
 *
 * Layout: wallet top left, escrow below it, phone on the right. Colours come from the CSS
 * theme variables, so the scene follows light and dark mode.
 *
 * Timeline (scroll progress p, 0..1), chapters start at CHAPTER_STARTS:
 *   0.00–0.11  the coin lifts out of the wallet
 *   0.11–0.36  it breaks into dots, drops into the escrow, the door locks, stamp HELD
 *   0.36–0.52  the top-up is sent to the phone while the payment stays held; once it is
 *              delivered the escrow unlocks
 *   0.52–0.82  the dots leave the escrow and re-form on the phone as airtime, then a gift card
 *   0.82–1.00  the other ending: delivery failed, the dots go back through the escrow to the
 *              wallet, stamp REFUNDED
 *
 * Illustration only. No real data.
 */

type RGB = readonly [number, number, number];
type Pt = readonly [number, number];
type Span = readonly [number, number];
/** Top-left box. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Box placed by its centre. */
interface Station {
  cx: number;
  cy: number;
  w: number;
  h: number;
}
interface Palette {
  ink: RGB;
  paper: RGB;
  paper2: RGB;
  ground: RGB;
  muted: RGB;
  line: RGB;
  brand: RGB;
  brandInk: RGB;
  ok: RGB;
  danger: RGB;
  shadow: RGB;
}

/** Where each of the five chapters starts; the last entry is the end. */
export const CHAPTER_STARTS = [0, 0.11, 0.36, 0.52, 0.82, 1] as const;

/** The moves that carry the dots from one shape to the next. */
const BEATS = {
  rise: [0, 0.08],
  pay: [0.11, 0.27],
  held: [0.31, 0.345],
  send: [0.39, 0.48],
  arrive: [0.52, 0.65],
  toCard: [0.7, 0.77],
  fail: [0.82, 0.86],
  refund: [0.86, 0.93],
  tuck: [0.945, 0.975],
} as const satisfies Record<string, Span>;

const N = 168; // dots in the token
const AMOUNT = '1.04 QUSDC';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
/** Ends at 1 after a small overshoot: how a stamp lands. */
const backOut = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
/** 0 before the span, 1 after it, linear inside. */
const seg = (p: number, [a, b]: Span) => clamp((p - a) / (b - a));
/** Fades in over a..b and out over c..d. */
const pulse = (p: number, a: number, b: number, c: number, d: number) =>
  seg(p, [a, b]) * (1 - seg(p, [c, d]));
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const bez = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
};
const hash = (i: number, k: number) => {
  const v = Math.sin(i * k) * 43758.5453;
  return v - Math.floor(v);
};
// Each dot leaves a little later than the one before and takes a slightly different curve.
const delay = Array.from({ length: N }, (_, i) => hash(i, 12.9898));
const drift = Array.from({ length: N }, (_, i): Pt => [
  (hash(i, 3.317) - 0.5) * 56,
  (hash(i, 7.713) - 0.5) * 56,
]);
const shuffle = Array.from({ length: N }, (_, i) => i).sort(
  (a, b) => hash(a, 78.233) - hash(b, 78.233),
);
/** Exactly N points out of a grid, spread evenly. */
const pick = (pts: Pt[]): Pt[] =>
  Array.from({ length: N }, (_, i) => pts[Math.floor((i * pts.length) / N)] ?? [0, 0]);

const FALLBACK: Palette = {
  ink: [20, 20, 20],
  paper: [251, 250, 247],
  paper2: [243, 242, 237],
  ground: [236, 235, 230],
  muted: [91, 90, 86],
  line: [205, 203, 196],
  brand: [217, 56, 30],
  brandInk: [251, 250, 247],
  ok: [47, 122, 61],
  danger: [180, 35, 24],
  shadow: [20, 20, 20],
};

export class TokenScene {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private k = 1; // shrinks the left column on short canvases
  private pal: Palette = FALLBACK;
  private mono = 'ui-monospace, monospace';
  private display = "'Arial Narrow', sans-serif";

  private wallet: Station = { cx: 0, cy: 0, w: 0, h: 0 };
  private vault: Station = { cx: 0, cy: 0, w: 0, h: 0 };
  private phone: Station = { cx: 0, cy: 0, w: 0, h: 0 };
  private screen: Box = { x: 0, y: 0, w: 0, h: 0 };
  private card: Box = { x: 0, y: 0, w: 0, h: 0 };
  private bars: Box[] = [];
  private coinR = 60;
  private coinUp: Pt = [0, 0]; // the coin held above the wallet
  private coinIn: Pt = [0, 0]; // the coin tucked into the wallet
  private bend1: Pt = [0, 0]; // curve of the wallet–escrow leg
  private bend2: Pt = [0, 0]; // curve of the escrow–phone leg
  /** Where every dot sits in each shape. */
  private f: Record<'coin' | 'vault' | 'bars' | 'card', Pt[]> = {
    coin: [],
    vault: [],
    bars: [],
    card: [],
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private reduce: boolean,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas not available');
    this.ctx = ctx;
    this.readTheme();
    this.resize();
  }

  /** Reads fonts and colours from the CSS variables. Call again when the theme changes. */
  readTheme() {
    const css = getComputedStyle(document.documentElement);
    // next/font registers generated family names; they are only known through the variables.
    const font = (name: string, fallback: string) => {
      const value = css.getPropertyValue(name).trim();
      return value ? `${value}, ${fallback}` : fallback;
    };
    this.mono = font('--font-plex-mono', 'ui-monospace, monospace');
    this.display = font('--font-barlow', "'Arial Narrow', sans-serif");
    const color = (name: string, fallback: RGB): RGB => {
      const raw = css.getPropertyValue(name).trim();
      if (!raw) return fallback;
      // The canvas turns any CSS colour into #rrggbb.
      this.ctx.fillStyle = '#000000';
      this.ctx.fillStyle = raw;
      const m = /^#([0-9a-f]{6})$/i.exec(String(this.ctx.fillStyle));
      if (!m) return fallback;
      const n = parseInt(m[1]!, 16);
      return [n >> 16, (n >> 8) & 255, n & 255];
    };
    this.pal = {
      ink: color('--color-ink', FALLBACK.ink),
      paper: color('--color-surface', FALLBACK.paper),
      paper2: color('--color-surface-2', FALLBACK.paper2),
      ground: color('--color-bg', FALLBACK.ground),
      muted: color('--color-muted', FALLBACK.muted),
      line: color('--color-line', FALLBACK.line),
      brand: color('--color-brand', FALLBACK.brand),
      brandInk: color('--color-brand-ink', FALLBACK.brandInk),
      ok: color('--color-ok', FALLBACK.ok),
      danger: color('--color-danger', FALLBACK.danger),
      shadow: color('--color-shadow', FALLBACK.shadow),
    };
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    // The scene is 1000 units wide and as tall as the canvas allows, within limits.
    const W = 1000;
    const H = clamp((W * r.height) / Math.max(1, r.width), 800, 1350);
    this.scale = Math.min(r.width / W, r.height / H);
    this.ox = (r.width - W * this.scale) / 2;
    this.oy = (r.height - H * this.scale) / 2;
    const k = (this.k = Math.min(1, H / 1000));

    this.wallet = { cx: 215, cy: H * 0.25, w: 300 * k, h: 190 * k };
    this.vault = { cx: 215, cy: H * 0.7, w: 264 * k, h: 264 * k };
    const ph = Math.min(730, H * 0.74);
    this.phone = { cx: 765, cy: H * 0.47, w: ph * 0.49, h: ph };
    const inset = 13;
    this.screen = {
      x: this.phone.cx - this.phone.w / 2 + inset,
      y: this.phone.cy - this.phone.h / 2 + inset,
      w: this.phone.w - inset * 2,
      h: this.phone.h - inset * 2,
    };

    const w = this.wallet;
    this.coinR = 60 * k;
    const coinX = w.cx + w.w * 0.17;
    this.coinUp = [coinX, w.cy - w.h / 2 - this.coinR - 14 * k];
    this.coinIn = [coinX, w.cy - w.h * 0.3];

    const s = this.screen;
    const bw = s.w * 0.13;
    const gap = s.w * 0.07;
    const base = s.y + s.h * 0.69;
    const x0 = s.x + (s.w - (4 * bw + 3 * gap)) / 2;
    this.bars = [0.3, 0.52, 0.76, 1].map((t, i) => ({
      x: x0 + i * (bw + gap),
      y: base - s.h * 0.2 * t,
      w: bw,
      h: s.h * 0.2 * t,
    }));
    const cw = s.w * 0.8;
    this.card = { x: s.x + (s.w - cw) / 2, y: s.y + s.h * 0.46, w: cw, h: cw / 1.586 };

    const v = this.vault;
    const barsMid: Pt = [s.x + s.w / 2, base - s.h * 0.1];
    this.bend1 = [w.cx + w.w * 1.12, lerp(this.coinUp[1], v.cy, 0.36)];
    this.bend2 = [barsMid[0] - s.w * 0.2, v.cy + 34 * k];

    const ordered = (pts: Pt[]) => shuffle.map((i) => pts[i]!);
    this.f = {
      coin: this.disc(this.coinUp, this.coinR * 0.93),
      vault: this.disc([v.cx, v.cy], v.w * 0.2),
      bars: ordered(this.grid(this.bars)),
      card: ordered(this.grid([this.card])),
    };
  }

  /** CSS pixels to scene units, for strokes and labels that must not shrink with the scene. */
  private u(px: number) {
    return px / this.scale;
  }

  private disc(c: Pt, r: number): Pt[] {
    const step = r * Math.sqrt(Math.PI / N) * 1.03;
    const n = Math.ceil(r / step);
    const pts: Pt[] = [];
    for (let j = -n; j < n; j++)
      for (let i = -n; i < n; i++) {
        const x = (i + 0.5) * step;
        const y = (j + 0.5) * step;
        if (x * x + y * y <= r * r) pts.push([c[0] + x, c[1] + y]);
      }
    return pick(pts);
  }

  private grid(rects: Box[]): Pt[] {
    const area = rects.reduce((sum, q) => sum + q.w * q.h, 0);
    const step = Math.sqrt(area / N) * 1.03;
    const pts: Pt[] = [];
    for (const q of rects) {
      const nx = Math.max(1, Math.round(q.w / step));
      const ny = Math.max(1, Math.round(q.h / step));
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++)
          pts.push([q.x + ((i + 0.5) * q.w) / nx, q.y + ((j + 0.5) * q.h) / ny]);
    }
    return pick(pts);
  }

  /** Where dot i is at progress p. tint 0 is stamp red (a token), 1 is ink (printed). */
  private dot(i: number, p: number): { pos: Pt; tint: number } {
    const B = BEATS;
    const go = (span: Span) => ease(clamp((seg(p, span) - delay[i]! * 0.4) / 0.6));
    const bend = (c: Pt): Pt => [c[0] + drift[i]![0], c[1] + drift[i]![1]];
    const coin = this.f.coin[i]!;
    const vault = this.f.vault[i]!;
    const bars = this.f.bars[i]!;
    const card = this.f.card[i]!;
    if (p < B.pay[1]) return { pos: bez(coin, bend(this.bend1), vault, go(B.pay)), tint: 0 };
    if (p < B.arrive[0]) return { pos: vault, tint: 0 };
    if (p < B.toCard[0]) {
      const t = go(B.arrive);
      return { pos: bez(vault, bend(this.bend2), bars, t), tint: seg(t, [0.7, 1]) };
    }
    if (p < B.fail[0]) {
      const t = go(B.toCard);
      return { pos: [lerp(bars[0], card[0], t), lerp(bars[1], card[1], t)], tint: 1 };
    }
    if (p < B.refund[0]) {
      const t = go(B.fail);
      return { pos: bez(card, bend(this.bend2), vault, t), tint: 1 - seg(t, [0, 0.4]) };
    }
    return { pos: bez(vault, bend(this.bend1), coin, go(B.refund)), tint: 0 };
  }

  draw(p: number, time: number) {
    const { ctx, pal, k } = this;
    const B = BEATS;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    ctx.fontKerning = 'normal';
    ctx.textRendering = 'geometricPrecision';
    ctx.lineJoin = 'round';

    // ---- what is happening at p
    const up = easeOut(seg(p, B.rise)) - ease(seg(p, B.tuck));
    const bob = this.reduce ? 0 : Math.sin(time / 650) * 3 * k * up;
    const coinAt: Pt = [this.coinUp[0], lerp(this.coinIn[1], this.coinUp[1], up) + bob];
    const coinSolid = Math.max(
      1 - seg(p, [B.pay[0], B.pay[0] + 0.02]),
      seg(p, [B.refund[1], B.refund[1] + 0.015]),
    );
    const open =
      pulse(p, 0.09, 0.12, 0.265, 0.295) +
      pulse(p, 0.5, 0.53, 0.645, 0.675) +
      pulse(p, 0.812, 0.832, 0.935, 0.955);
    const dial = (ease(seg(p, [0.285, 0.32])) - ease(seg(p, [0.48, 0.51]))) * Math.PI * 1.5;
    const held = seg(p, B.held);
    const heldOff = seg(p, [0.485, 0.505]);
    const isHeld = p >= 0.3 && p < 0.495;
    const isReleased = p >= 0.495 && p < 0.68;
    const isRefunding = p >= B.fail[0] && p < B.refund[1];
    const isRefunded = p >= B.refund[1];
    const refunded = seg(p, [0.95, 0.982]);
    const barsSolid = pulse(p, 0.645, 0.665, 0.7, 0.712);
    const cardSolid = pulse(p, 0.765, 0.785, 0.82, 0.832);
    // Which of the three places the eye should be on.
    const fWallet = Math.max(1 - seg(p, [0.14, 0.26]), seg(p, [0.86, 0.93]));
    const fVault = Math.max(pulse(p, 0.12, 0.2, 0.6, 0.68), pulse(p, 0.82, 0.85, 0.93, 0.97));
    const fPhone = pulse(p, 0.36, 0.4, 0.86, 0.92);
    const paying = pulse(p, B.pay[0], B.pay[0] + 0.02, B.pay[1], B.pay[1] + 0.02);
    const sending = pulse(p, 0.37, 0.39, 0.5, 0.52);
    const arriving = pulse(p, B.arrive[0], B.arrive[0] + 0.02, B.arrive[1], B.arrive[1] + 0.02);
    const failing = pulse(p, B.fail[0], B.fail[0] + 0.01, B.fail[1] - 0.01, B.fail[1]);
    const refunding = pulse(p, B.refund[0], B.refund[0] + 0.01, B.refund[1], B.refund[1] + 0.02);

    // ---- the two legs of the route, under everything else
    const w = this.wallet;
    const v = this.vault;
    const s = this.screen;
    const vaultAt: Pt = [v.cx, v.cy];
    const phoneAt: Pt = [s.x + s.w / 2, s.y + s.h * 0.56];
    const march = this.reduce ? 0 : time / 60;
    this.leg(this.coinUp, this.bend1, vaultAt, rgba(pal.line), 0);
    this.leg(vaultAt, this.bend2, phoneAt, rgba(pal.line), 0);
    if (paying > 0) this.leg(this.coinUp, this.bend1, vaultAt, rgba(pal.ink, paying), -march);
    if (refunding > 0)
      this.leg(this.coinUp, this.bend1, vaultAt, rgba(pal.brand, refunding), march);
    if (sending + arriving > 0)
      this.leg(vaultAt, this.bend2, phoneAt, rgba(pal.ink, sending + arriving), -march);
    if (failing > 0) this.leg(vaultAt, this.bend2, phoneAt, rgba(pal.brand, failing), march);
    // The delivery order travelling to the phone. The payment itself has not moved yet.
    if (sending > 0) {
      const phase = seg(p, [0.37, 0.5]) * 3 + (this.reduce ? 0 : time / 1500);
      for (let i = 0; i < 3; i++) {
        const [x, y] = bez(vaultAt, this.bend2, phoneAt, ((phase + i / 3) % 1) * 0.6);
        const d = 15 * k;
        ctx.fillStyle = rgba(pal.ground);
        ctx.fillRect(x - d / 2, y - d / 2, d, d);
        ctx.lineWidth = this.u(1.75);
        ctx.strokeStyle = rgba(pal.ink, sending);
        ctx.strokeRect(x - d / 2, y - d / 2, d, d);
      }
    }

    // ---- wallet, with the coin between its back and its front pocket
    // The coin's seat above the wallet: an empty outline whenever the coin is not in it.
    const seat = 1 - coinSolid * clamp(up);
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.coinUp[0], this.coinUp[1], this.coinR, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pal.ground);
    ctx.fill();
    ctx.setLineDash([this.u(3), this.u(5)]);
    ctx.lineWidth = this.u(1.5);
    ctx.strokeStyle = rgba(pal.line, seat);
    ctx.stroke();
    ctx.restore();
    const toneW = mix(pal.line, pal.ink, 0.4 + 0.6 * fWallet);
    this.drawWalletBack(toneW, fWallet);
    if (coinSolid > 0.01) this.drawCoin(coinAt[0], coinAt[1], this.coinR, coinSolid, up);
    this.drawWalletFront(toneW);
    this.drawVault(mix(pal.line, pal.ink, 0.4 + 0.6 * fVault), fVault, open, dial, time, {
      isHeld,
      isReleased,
      isRefunding,
    });
    this.drawPhone(p, time, mix(pal.line, pal.ink, 0.4 + 0.6 * fPhone), fPhone, {
      barsSolid,
      cardSolid,
    });

    // ---- the token in motion
    let dots = 1 - Math.max(coinSolid, barsSolid, cardSolid);
    // Behind the closed escrow door the dots are out of sight.
    if (p >= B.pay[1] && p < B.arrive[0]) dots *= clamp(open * 2);
    if (dots > 0.01) {
      const d = 6.4 * k;
      ctx.globalAlpha = dots;
      for (let i = 0; i < N; i++) {
        const { pos, tint } = this.dot(i, p);
        ctx.fillStyle = rgba(tint <= 0 ? pal.brand : mix(pal.brand, pal.ink, tint));
        ctx.fillRect(pos[0] - d / 2, pos[1] - d / 2, d, d);
      }
      ctx.globalAlpha = 1;
    }

    // ---- stamps
    this.stamp('HELD', v.cx, v.cy, -0.2, v.w * 0.32, held, heldOff);
    this.stamp('REFUNDED', w.cx, w.cy + w.h * 0.16, -0.14, w.w * 0.2, refunded, 0);

    // ---- words
    const small = this.scale < 0.5;
    const away = p >= B.pay[0] + 0.02 && !isRefunded;
    this.caption(
      w.cx,
      w.cy + w.h / 2,
      'Your wallet',
      away ? '0.00 QUSDC' : AMOUNT,
      away ? pal.muted : pal.brand,
      fWallet,
    );
    const [vaultSub, vaultColor]: [string, RGB] = isHeld
      ? [`Holding ${AMOUNT}`, pal.brand]
      : isReleased
        ? ['Released', pal.ok]
        : isRefunding
          ? ['Refunding', pal.brand]
          : [small ? 'QartaCheckout' : 'QartaCheckout · QIE Mainnet', pal.muted];
    this.caption(v.cx, v.cy + v.h / 2, 'Escrow contract', vaultSub, vaultColor, fVault);
    this.caption(
      this.phone.cx,
      this.phone.cy + this.phone.h / 2,
      'Their phone',
      '+234 803 ••• 4567',
      pal.muted,
      fPhone,
    );
    const mid1 = bez(this.coinUp, this.bend1, vaultAt, 0.5);
    this.tag('Pay', mid1[0], mid1[1], paying, pal.ink);
    this.tag('Refund', mid1[0], mid1[1], refunding, pal.brand);
    const gapMid = lerp(v.cx + v.w / 2, this.phone.cx - this.phone.w / 2, 0.5);
    this.tag('Reloadly', gapMid, v.cy - 40 * k, sending, pal.ink, 'center');
  }

  // ------------------------------------------------------------------ pieces

  private rr(x: number, y: number, w: number, h: number, r: number | number[]) {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
  }

  private text(
    str: string,
    x: number,
    y: number,
    size: number,
    color: string,
    o: { weight?: number; align?: CanvasTextAlign; font?: string; spacing?: number } = {},
  ) {
    const { ctx } = this;
    ctx.font = `${o.weight ?? 500} ${size}px ${o.font ?? this.mono}`;
    ctx.letterSpacing = `${o.spacing ?? 0}px`;
    ctx.textAlign = o.align ?? 'center';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.letterSpacing = '0px';
  }

  /** Dashed route line. A changing offset makes the dashes walk along it. */
  private leg(a: Pt, c: Pt, b: Pt, color: string, offset: number) {
    const { ctx } = this;
    ctx.save();
    ctx.setLineDash([this.u(5), this.u(6)]);
    ctx.lineDashOffset = this.u(offset);
    ctx.lineWidth = this.u(1.5);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
    ctx.stroke();
    ctx.restore();
  }

  /** Small boxed label on the route. */
  private tag(
    str: string,
    x: number,
    y: number,
    alpha: number,
    color: RGB,
    align: 'left' | 'center' = 'left',
  ) {
    if (alpha <= 0.01) return;
    const { ctx, pal } = this;
    const size = this.u(this.scale < 0.5 ? 9.5 : 11);
    ctx.save();
    ctx.globalAlpha = clamp(alpha);
    ctx.font = `600 ${size}px ${this.mono}`;
    ctx.letterSpacing = `${size * 0.08}px`;
    const label = str.toUpperCase();
    const tw = ctx.measureText(label).width;
    const bw = tw + size * 1.1;
    const bh = size * 1.9;
    const bx = align === 'left' ? x + size * 0.9 : x - bw / 2;
    this.rr(bx, y - bh / 2, bw, bh, 0);
    ctx.fillStyle = rgba(pal.ground);
    ctx.fill();
    ctx.lineWidth = this.u(1.5);
    ctx.strokeStyle = rgba(color);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(color);
    ctx.fillText(label, bx + size * 0.55 + size * 0.04, y + size * 0.06);
    ctx.restore();
  }

  /** Two lines under a station: its name, and what it holds right now. */
  private caption(
    cx: number,
    top: number,
    title: string,
    sub: string,
    subColor: RGB,
    focus: number,
  ) {
    const { pal } = this;
    const size = this.u(this.scale < 0.5 ? 10 : 12);
    const y = top + this.u(8) + size * 1.7;
    this.text(title.toUpperCase(), cx, y, size, rgba(mix(pal.muted, pal.ink, focus)), {
      weight: 600,
      spacing: size * 0.08,
    });
    this.text(sub, cx, y + size * 1.55, size * 0.94, rgba(subColor));
  }

  /** Rubber stamp. t lands it, off lifts it away again. */
  private stamp(
    str: string,
    cx: number,
    cy: number,
    rot: number,
    size: number,
    t: number,
    off: number,
  ) {
    if (t <= 0 || off >= 1) return;
    const { ctx, pal } = this;
    const grow = lerp(2.3, 1, backOut(clamp(t))) * (1 + off * 0.3);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(grow, grow);
    ctx.globalAlpha = clamp(t * 3) * (1 - off) * 0.95;
    ctx.font = `800 ${size}px ${this.display}`;
    ctx.letterSpacing = `${size * 0.07}px`;
    const bw = ctx.measureText(str).width + size * 0.48;
    const bh = size * 1.14;
    ctx.fillStyle = rgba(pal.paper, 0.9);
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.lineWidth = Math.max(size * 0.07, this.u(2.5));
    ctx.strokeStyle = rgba(pal.brand);
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(pal.brand);
    ctx.fillText(str, size * 0.035, size * 0.06);
    ctx.restore();
  }

  /** Hard offset shadow, the same one the site's menus cast. Grows with focus. */
  private shadow(x: number, y: number, w: number, h: number, r: number, focus: number) {
    const off = 9 * this.k * focus;
    if (off < 0.5) return;
    this.rr(x + off, y + off, w, h, r);
    this.ctx.fillStyle = rgba(this.pal.shadow);
    this.ctx.fill();
  }

  private drawWalletBack(tone: RGB, focus: number) {
    const { ctx, pal, k } = this;
    const { cx, cy, w, h } = this.wallet;
    const x = cx - w / 2;
    const y = cy - h / 2;
    ctx.lineWidth = this.u(2);
    ctx.strokeStyle = rgba(tone);
    this.shadow(x, y, w, h, 14 * k, focus);
    // A card peeking out of the back pocket.
    this.rr(x + w * 0.08, y - 22 * k, w * 0.36, 60 * k, 7 * k);
    ctx.fillStyle = rgba(pal.paper);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(mix(pal.line, pal.brand, focus));
    ctx.fillRect(x + w * 0.08 + 12 * k, y - 11 * k, w * 0.12, 7 * k);
    this.rr(x, y, w, h, 14 * k);
    ctx.fillStyle = rgba(pal.paper2);
    ctx.fill();
    ctx.stroke();
  }

  private drawWalletFront(tone: RGB) {
    const { ctx, pal, k } = this;
    const { cx, cy, w, h } = this.wallet;
    const x = cx - w / 2;
    const top = cy - h * 0.18;
    const ph = h * 0.68;
    ctx.lineWidth = this.u(2);
    ctx.strokeStyle = rgba(tone);
    this.rr(x, top, w, ph, [4 * k, 4 * k, 14 * k, 14 * k]);
    ctx.fillStyle = rgba(pal.paper);
    ctx.fill();
    ctx.stroke();
    // Stitching.
    ctx.save();
    ctx.setLineDash([this.u(3), this.u(4)]);
    ctx.lineWidth = this.u(1);
    ctx.strokeStyle = rgba(pal.muted, 0.55);
    this.rr(x + 10 * k, top + 10 * k, w - 20 * k, ph - 20 * k, [1, 1, 7 * k, 7 * k]);
    ctx.stroke();
    ctx.restore();
    // Clasp.
    const cw = 54 * k;
    const ch = 36 * k;
    const clY = top + ph * 0.5 - ch / 2;
    this.rr(x + w - cw, clY, cw, ch, [ch / 2, 0, 0, ch / 2]);
    ctx.fillStyle = rgba(pal.paper2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w - cw * 0.5, clY + ch / 2, 5.5 * k, 0, Math.PI * 2);
    ctx.fillStyle = rgba(tone);
    ctx.fill();
  }

  /** The token: a flat red coin with a Q cut out of it. */
  private drawCoin(x: number, y: number, r: number, alpha: number, up: number) {
    const { ctx, pal, k } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    const off = 6 * k * clamp(up);
    if (off > 0.5) {
      ctx.fillStyle = rgba(pal.shadow);
      ctx.beginPath();
      ctx.arc(x + off, y + off, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = rgba(pal.brand);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = this.u(2);
    ctx.strokeStyle = rgba(pal.ink);
    ctx.stroke();
    // Milled edge.
    ctx.setLineDash([r * 0.05, r * 0.09]);
    ctx.lineWidth = r * 0.07;
    ctx.strokeStyle = rgba(pal.brandInk, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Q: a ring and a tail.
    ctx.strokeStyle = rgba(pal.brandInk);
    ctx.lineWidth = r * 0.17;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(x - r * 0.03, y - r * 0.03, r * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + r * 0.12, y + r * 0.12);
    ctx.lineTo(x + r * 0.5, y + r * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  private drawVault(
    tone: RGB,
    focus: number,
    open: number,
    dial: number,
    time: number,
    state: { isHeld: boolean; isReleased: boolean; isRefunding: boolean },
  ) {
    const { ctx, pal, k } = this;
    const { cx, cy, w } = this.vault;
    const x = cx - w / 2;
    const y = cy - w / 2;
    const R = w * 0.31;
    const accent = state.isHeld || state.isRefunding ? pal.brand : state.isReleased ? pal.ok : tone;
    ctx.save();
    ctx.lineWidth = this.u(2);
    ctx.strokeStyle = rgba(tone);
    this.shadow(x, y, w, w, 16 * k, focus);
    this.rr(x, y, w, w, 16 * k);
    ctx.fillStyle = rgba(pal.paper);
    ctx.fill();
    ctx.stroke();
    // Inner panel.
    ctx.lineWidth = this.u(1);
    ctx.strokeStyle = rgba(pal.line);
    this.rr(x + 12 * k, y + 12 * k, w - 24 * k, w - 24 * k, 8 * k);
    ctx.stroke();
    // Dial marks around the door.
    ctx.strokeStyle = rgba(accent === tone ? pal.muted : accent);
    ctx.lineWidth = this.u(1.25);
    ctx.beginPath();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const r1 = R + 8 * k;
      const r2 = R + (i % 3 === 0 ? 17 : 12) * k;
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    }
    ctx.stroke();
    // Status light.
    const blink = state.isHeld && !this.reduce ? 0.7 + 0.3 * Math.sin(time / 320) : 1;
    ctx.fillStyle = rgba(accent === tone ? pal.line : accent, blink);
    ctx.fillRect(x + w - 34 * k, y + 20 * k, 13 * k, 13 * k);
    // Inside of the safe, then the door swinging on its left hinge.
    ctx.fillStyle = rgba(pal.shadow);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(tone);
    ctx.fillRect(cx - R - 9 * k, cy - R * 0.6, 9 * k, 18 * k);
    ctx.fillRect(cx - R - 9 * k, cy + R * 0.6 - 18 * k, 9 * k, 18 * k);
    ctx.translate(cx - R, cy);
    ctx.scale(1 - clamp(open) * 0.86, 1);
    ctx.translate(R, 0);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pal.paper2);
    ctx.fill();
    ctx.lineWidth = this.u(2);
    ctx.strokeStyle = rgba(tone);
    ctx.stroke();
    ctx.lineWidth = this.u(1);
    ctx.strokeStyle = rgba(pal.line);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.74, 0, Math.PI * 2);
    ctx.stroke();
    // Wheel handle.
    ctx.rotate(dial);
    ctx.strokeStyle = rgba(tone);
    ctx.fillStyle = rgba(tone);
    ctx.lineWidth = this.u(2.5);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      const dx = Math.cos(a) * R * 0.52;
      const dy = Math.sin(a) * R * 0.52;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(-dx, -dy);
      ctx.stroke();
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.arc(dx * side, dy * side, 4.5 * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.17, 0, Math.PI * 2);
    ctx.fillStyle = rgba(pal.paper);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawPhone(
    p: number,
    time: number,
    tone: RGB,
    focus: number,
    solid: { barsSolid: number; cardSolid: number },
  ) {
    const { ctx, pal } = this;
    const { cx, cy, w, h } = this.phone;
    const x = cx - w / 2;
    const y = cy - h / 2;
    const s = this.screen;
    const radius = w * 0.14;
    ctx.save();
    ctx.lineWidth = this.u(2);
    ctx.strokeStyle = rgba(tone);
    this.shadow(x, y, w, h, radius, focus);
    // Side button.
    ctx.fillStyle = rgba(tone);
    ctx.fillRect(x + w, y + h * 0.2, this.u(2) + 3, h * 0.1);
    this.rr(x, y, w, h, radius);
    ctx.fillStyle = rgba(pal.paper);
    ctx.fill();
    ctx.stroke();
    this.rr(s.x, s.y, s.w, s.h, radius - 9);
    ctx.fillStyle = rgba(pal.ground);
    ctx.fill();
    ctx.lineWidth = this.u(1);
    ctx.strokeStyle = rgba(pal.line);
    ctx.stroke();
    ctx.clip();
    this.drawScreen(p, time, solid);
    ctx.restore();
    // Speaker pill.
    this.rr(cx - w * 0.13, s.y + s.w * 0.045, w * 0.26, s.w * 0.055, s.w * 0.03);
    ctx.fillStyle = rgba(tone);
    ctx.fill();
  }

  /** Everything on the phone screen. The caller has already clipped to it. */
  private drawScreen(p: number, time: number, solid: { barsSolid: number; cardSolid: number }) {
    const { ctx, pal } = this;
    const s = this.screen;
    const sw = s.w;
    const mid = s.x + sw / 2;

    // Lock screen until the delivery starts.
    const idle = 1 - seg(p, [0.36, 0.385]);
    if (idle > 0.01) {
      ctx.globalAlpha = idle * 0.5;
      this.text('9:41', mid, s.y + s.h * 0.34, sw * 0.32, rgba(pal.muted), {
        weight: 800,
        font: this.display,
      });
      this.text('Mon 23 Nov', mid, s.y + s.h * 0.34 + sw * 0.13, sw * 0.066, rgba(pal.muted));
      ctx.globalAlpha = 1;
    }

    // Notification slip: slides in from the top and reports the order's state.
    const slipIn = easeOut(seg(p, [0.365, 0.4]));
    if (slipIn > 0.01) {
      const pad = sw * 0.06;
      const x = s.x + pad;
      const w = sw - pad * 2;
      const h = sw * 0.47;
      const y = s.y + sw * 0.19 - (1 - slipIn) * (h + sw * 0.3);
      const gift = p >= 0.71 && p < 0.825;
      const delivered = p >= 0.49 && p < 0.825;
      const failed = p >= 0.825;
      const back = p >= BEATS.refund[1];
      const state = back ? pal.brand : failed ? pal.danger : delivered ? pal.ok : pal.muted;

      ctx.fillStyle = rgba(pal.shadow);
      ctx.fillRect(x + sw * 0.016, y + sw * 0.016, w, h);
      ctx.fillStyle = rgba(pal.paper);
      ctx.fillRect(x, y, w, h);
      ctx.lineWidth = this.u(1.5);
      ctx.strokeStyle = rgba(pal.ink);
      ctx.strokeRect(x, y, w, h);

      const left = x + sw * 0.055;
      const right = x + w - sw * 0.055;
      const ty = y + sw * 0.115;
      this.text(gift ? 'GIFT CARD' : 'MTN NIGERIA', left, ty, sw * 0.072, rgba(pal.ink), {
        weight: 600,
        align: 'left',
        spacing: sw * 0.004,
      });
      this.text(
        gift ? 'Code ready to reveal' : '₦1,500 airtime',
        left,
        ty + sw * 0.088,
        sw * 0.06,
        rgba(pal.muted),
        { align: 'left' },
      );
      // Ten squares that fill as the top-up travels.
      const cells = 10;
      const filled = failed ? 6 : delivered ? cells : Math.round(seg(p, BEATS.send) * cells);
      const cw = (right - left) / cells;
      const py = ty + sw * 0.135;
      for (let i = 0; i < cells; i++) {
        ctx.fillStyle = rgba(i < filled ? (state === pal.muted ? pal.ink : state) : pal.line);
        ctx.fillRect(left + i * cw, py, cw - sw * 0.012, sw * 0.034);
      }
      const dotsText = this.reduce ? '...' : '.'.repeat(1 + (Math.floor(time / 380) % 3));
      const word = back
        ? 'REFUNDED'
        : failed
          ? 'FAILED'
          : delivered
            ? 'DELIVERED'
            : `SENDING${dotsText}`;
      const sy = py + sw * 0.034 + sw * 0.095;
      this.text(word, left, sy, sw * 0.062, rgba(state), {
        weight: 600,
        align: 'left',
        spacing: sw * 0.005,
      });
      // Tick or cross at the right end of the status line.
      const g = sw * 0.03;
      const gx = right - g;
      const gy = sy - sw * 0.022;
      ctx.lineWidth = sw * 0.014;
      ctx.lineCap = 'square';
      ctx.strokeStyle = rgba(state);
      ctx.beginPath();
      if (failed && !back) {
        ctx.moveTo(gx - g, gy - g);
        ctx.lineTo(gx + g, gy + g);
        ctx.moveTo(gx + g, gy - g);
        ctx.lineTo(gx - g, gy + g);
      } else if (delivered || back) {
        ctx.moveTo(gx - g, gy);
        ctx.lineTo(gx - g * 0.3, gy + g * 0.8);
        ctx.lineTo(gx + g, gy - g * 0.8);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    if (solid.barsSolid > 0.01) this.drawBars(solid.barsSolid, p);
    if (solid.cardSolid > 0.01) this.drawCard(solid.cardSolid);

    // The other ending: nothing arrived.
    const failed = seg(p, [0.85, 0.875]);
    if (failed > 0.01) {
      const cy = s.y + s.h * 0.6;
      const g = sw * 0.085;
      ctx.globalAlpha = failed;
      ctx.lineWidth = this.u(2);
      ctx.strokeStyle = rgba(pal.danger);
      ctx.strokeRect(mid - g * 1.7, cy - g * 1.7, g * 3.4, g * 3.4);
      ctx.lineWidth = sw * 0.022;
      ctx.beginPath();
      ctx.moveTo(mid - g * 0.75, cy - g * 0.75);
      ctx.lineTo(mid + g * 0.75, cy + g * 0.75);
      ctx.moveTo(mid + g * 0.75, cy - g * 0.75);
      ctx.lineTo(mid - g * 0.75, cy + g * 0.75);
      ctx.stroke();
      this.text('NOT DELIVERED', mid, cy + g * 3.1, sw * 0.066, rgba(pal.danger), {
        weight: 600,
        spacing: sw * 0.005,
      });
      this.text(
        p >= BEATS.refund[1] ? 'Payment returned' : 'Returning payment',
        mid,
        cy + g * 3.1 + sw * 0.095,
        sw * 0.058,
        rgba(pal.muted),
      );
      ctx.globalAlpha = 1;
    }
  }

  private drawBars(alpha: number, p: number) {
    const { ctx, pal } = this;
    const s = this.screen;
    const mid = s.x + s.w / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgba(pal.ink);
    for (const b of this.bars) ctx.fillRect(b.x, b.y, b.w, b.h);
    const base = this.bars[0]!.y + this.bars[0]!.h;
    ctx.fillRect(
      this.bars[0]!.x,
      base + s.w * 0.03,
      this.bars[3]!.x + this.bars[3]!.w - this.bars[0]!.x,
      this.u(2),
    );
    // The amount rises into place a moment after the bars.
    const t = easeOut(seg(p, [0.655, 0.685]));
    ctx.globalAlpha = alpha * t;
    const ay = base + s.w * 0.3 + (1 - t) * s.w * 0.05;
    this.text('+₦1,500', mid, ay, s.w * 0.24, rgba(pal.ink), {
      weight: 800,
      font: this.display,
    });
    this.text('AIRTIME RECEIVED', mid, ay + s.w * 0.1, s.w * 0.058, rgba(pal.muted), {
      weight: 600,
      spacing: s.w * 0.005,
    });
    ctx.restore();
  }

  private drawCard(alpha: number) {
    const { ctx, pal } = this;
    const c = this.card;
    const s = this.screen;
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = c.w * 0.05;
    this.rr(c.x + c.w * 0.03, c.y + c.w * 0.03, c.w, c.h, r);
    ctx.fillStyle = rgba(pal.shadow);
    ctx.fill();
    this.rr(c.x, c.y, c.w, c.h, r);
    ctx.fillStyle = rgba(pal.paper);
    ctx.fill();
    ctx.lineWidth = this.u(2);
    ctx.strokeStyle = rgba(pal.ink);
    ctx.stroke();
    // The same card as the Qarta Pay mark: a rule and one red block.
    ctx.lineWidth = this.u(1.5);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y + c.h * 0.3);
    ctx.lineTo(c.x + c.w, c.y + c.h * 0.3);
    ctx.stroke();
    this.text('GIFT CARD', c.x + c.w * 0.08, c.y + c.h * 0.2, c.w * 0.062, rgba(pal.ink), {
      weight: 600,
      align: 'left',
      spacing: c.w * 0.006,
    });
    ctx.fillStyle = rgba(pal.brand);
    ctx.fillRect(c.x + c.w * 0.08, c.y + c.h * 0.46, c.w * 0.2, c.h * 0.2);
    this.text('•••• •••• 4F2A', c.x + c.w * 0.08, c.y + c.h * 0.88, c.w * 0.068, rgba(pal.ink), {
      align: 'left',
    });
    this.text(
      'CODE DELIVERED',
      s.x + s.w / 2,
      c.y + c.h + s.w * 0.17,
      s.w * 0.058,
      rgba(pal.muted),
      { weight: 600, spacing: s.w * 0.005 },
    );
    ctx.restore();
  }
}
