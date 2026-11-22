/**
 * Canvas scene for the "token journey" section: one payment drawn as 220 points of light.
 *
 * Timeline (scroll progress p, 0..1):
 *   0.00–0.10  a solid coin rests in the wallet
 *   0.10–0.28  it dissolves and arcs into the escrow vault; the door wheel spins shut
 *   0.28–0.42  locked in the vault
 *   0.42–0.56  the door opens; the points stream to the phone
 *   0.56–0.70  they re-form as signal bars, then a solid "airtime received" screen
 *   0.70–0.84  the bars re-form as a gift card
 *   0.84–1.00  delivery failed: the points fly back through the vault and land as a coin again
 *
 * Illustration only. No real data.
 */

type RGB = readonly [number, number, number];
type Pt = readonly [number, number];
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const AMBER: RGB = [214, 178, 118]; // brass
const TEAL: RGB = [226, 220, 208]; // ivory, for the refunded coin
const GREEN: RGB = [143, 191, 152];
const RED: RGB = [217, 130, 107];
const INK: RGB = [237, 232, 223];
const DIM: RGB = [154, 147, 138];
const N = 220;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
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
const delay = Array.from({ length: N }, (_, i) => hash(i, 12.9898));
const shuffle = Array.from({ length: N }, (_, i) => i).sort(
  (a, b) => hash(a, 78.233) - hash(b, 78.233),
);

export class TokenScene {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private wide = true;
  private wallet: Pt = [0, 0];
  private vault = { x: 0, y: 0, s: 150 };
  private phone: Box = { x: 0, y: 0, w: 0, h: 0 };
  private screen: Box = { x: 0, y: 0, w: 0, h: 0 };
  private coinR = 50;
  private f: Record<'wallet' | 'vault' | 'screenCoin' | 'bars' | 'card', Pt[]> = {
    wallet: [],
    vault: [],
    screenCoin: [],
    bars: [],
    card: [],
  };
  private barRects: Box[] = [];
  private card: Box = { x: 0, y: 0, w: 0, h: 0 };

  private sans = 'ui-sans-serif, system-ui, sans-serif';
  private serif = 'Georgia, serif';
  private mono = 'ui-monospace, monospace';

  constructor(
    private canvas: HTMLCanvasElement,
    private reduce: boolean,
  ) {
    // next/font registers generated family names; read them from the CSS variables.
    const css = getComputedStyle(document.documentElement);
    const font = (v: string, fallback: string) => {
      const value = css.getPropertyValue(v).trim();
      return value ? `${value}, ${fallback}` : fallback;
    };
    this.sans = font('--font-geist', this.sans);
    this.serif = font('--font-instrument', this.serif);
    this.mono = font('--font-geist-mono', this.mono);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas not available');
    this.ctx = ctx;
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.wide = r.width / Math.max(1, r.height) > 0.95;
    const [W, H] = this.wide ? [1000, 640] : [600, 780];
    this.scale = Math.min(r.width / W, r.height / H);
    this.ox = (r.width - W * this.scale) / 2;
    this.oy = (r.height - H * this.scale) / 2;
    if (this.wide) {
      this.wallet = [140, 270];
      this.vault = { x: 450, y: 340, s: 160 };
      this.phone = { x: 805, y: 300, w: 230, h: 460 };
    } else {
      this.wallet = [150, 120];
      this.vault = { x: 190, y: 340, s: 130 };
      this.phone = { x: 430, y: 560, w: 200, h: 390 };
    }
    const ph = this.phone;
    this.screen = { x: ph.x - ph.w / 2 + 12, y: ph.y - ph.h / 2 + 12, w: ph.w - 24, h: ph.h - 24 };
    this.coinR = this.wide ? 46 : 40;
    this.buildFormations();
  }

  private disk(cx: number, cy: number, r: number): Pt[] {
    const rim = 64;
    const face = N - rim;
    const golden = Math.PI * (3 - Math.sqrt(5));
    return Array.from({ length: N }, (_, i): Pt => {
      if (i < rim) {
        const a = (i / rim) * Math.PI * 2;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      }
      const j = i - rim;
      const rr = r * 0.74 * Math.sqrt((j + 0.5) / face);
      const a = j * golden;
      return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
    });
  }

  private fill(rects: Box[], step: number): Pt[] {
    const pts: Pt[] = [];
    for (const q of rects)
      for (let y = q.y + step / 2; y < q.y + q.h; y += step)
        for (let x = q.x + step / 2; x < q.x + q.w; x += step) pts.push([x, y]);
    return Array.from(
      { length: N },
      (_, i) => pts[Math.floor((i * pts.length) / N)] ?? [q0(rects).x, q0(rects).y],
    );
  }

  private buildFormations() {
    const s = this.screen;
    const bw = s.w * 0.12;
    const gap = s.w * 0.06;
    const base = s.y + s.h * 0.5;
    const x0 = s.x + (s.w - (4 * bw + 3 * gap)) / 2;
    this.barRects = [0.28, 0.5, 0.72, 0.95].map((k, i) => ({
      x: x0 + i * (bw + gap),
      y: base - s.h * 0.26 * k,
      w: bw,
      h: s.h * 0.26 * k,
    }));
    const cw = s.w * 0.82;
    const ch = cw / 1.586;
    this.card = { x: s.x + (s.w - cw) / 2, y: s.y + s.h * 0.24, w: cw, h: ch };
    const c = this.card;
    const ordered = (pts: Pt[]) => shuffle.map((i) => pts[i]!);
    this.f = {
      wallet: this.disk(this.wallet[0], this.wallet[1], this.coinR),
      vault: this.disk(this.vault.x, this.vault.y, this.coinR * 0.6),
      screenCoin: this.disk(s.x + s.w / 2, s.y + s.h * 0.38, this.coinR * 0.72),
      bars: ordered(this.fill(this.barRects, s.w * 0.03)),
      card: ordered(this.fill([c], c.w / 19)),
    };
  }

  /** Where particle i is at progress p, and its colour. */
  private particle(i: number, p: number, time: number): { pos: Pt; col: RGB } {
    const d = delay[i]! * 0.35;
    const st = (t: number) => ease(clamp((t - d) / 0.65));
    const w = this.f.wallet[i]!;
    const v = this.f.vault[i]!;
    const sc = this.f.screenCoin[i]!;
    const b = this.f.bars[i]!;
    const c = this.f.card[i]!;
    const lift = (a: Pt, z: Pt, h: number): Pt => [lerp(a[0], z[0], 0.5), Math.min(a[1], z[1]) - h];
    if (p < 0.3) return { pos: bez(w, lift(w, v, 150), v, st(seg(p, 0.1, 0.28))), col: AMBER };
    if (p < 0.42) {
      const k = this.reduce ? 0 : Math.sin(time / 380 + i) * 1.6;
      return { pos: [v[0] + k, v[1] + k * 0.6], col: AMBER };
    }
    if (p < 0.58) return { pos: bez(v, lift(v, sc, 170), sc, st(seg(p, 0.42, 0.56))), col: AMBER };
    if (p < 0.7) {
      const t = st(seg(p, 0.57, 0.64));
      return { pos: [lerp(sc[0], b[0], t), lerp(sc[1], b[1], t)], col: mix(AMBER, GREEN, t) };
    }
    if (p < 0.84) {
      const t = st(seg(p, 0.7, 0.77));
      return { pos: [lerp(b[0], c[0], t), lerp(b[1], c[1], t)], col: mix(GREEN, AMBER, t) };
    }
    const t = st(seg(p, 0.85, 0.97));
    let pos: Pt;
    if (t < 0.25) {
      const k = t / 0.25;
      pos = [lerp(c[0], sc[0], k), lerp(c[1], sc[1], k)];
    } else {
      const k = (t - 0.25) / 0.75;
      pos =
        k < 0.5
          ? bez(sc, [lerp(sc[0], v[0], 0.5), v[1] + 160], v, k / 0.5)
          : bez(v, lift(v, w, 150), w, (k - 0.5) / 0.5);
    }
    return { pos, col: mix(AMBER, TEAL, t) };
  }

  draw(p: number, time: number) {
    const { ctx } = this;
    const cw = this.canvas.width / this.dpr;
    const chh = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cw, chh);
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    // Crisp, evenly kerned small labels at any scale.
    ctx.fontKerning = 'normal';
    ctx.letterSpacing = '0px';
    ctx.textRendering = 'geometricPrecision';

    const phoneIn = easeOut(seg(p, 0.34, 0.5));
    const dy = (1 - phoneIn) * 70;

    this.drawPath();
    this.drawWallet(p);
    this.drawVault(p, time);
    this.drawHandBack(dy, phoneIn);
    this.drawPhone(p, dy, phoneIn);

    // Solid objects replace the points once a shape has settled.
    const coinStart = 1 - seg(p, 0.1, 0.14);
    const coinEnd = seg(p, 0.96, 0.99);
    const barsSolid = seg(p, 0.64, 0.67) * (1 - seg(p, 0.7, 0.72));
    const cardSolid = seg(p, 0.77, 0.8) * (1 - seg(p, 0.85, 0.87));
    const lock = this.lockAmount(p);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const inPhone = p >= 0.52 && p < 0.9;
    for (let i = 0; i < N; i++) {
      const { pos, col } = this.particle(i, p, time);
      const y = pos[1] + (inPhone ? dy : 0);
      let a = 1 - Math.max(coinStart, coinEnd, barsSolid, cardSolid);
      if (p > 0.26 && p < 0.46) a *= 1 - 0.55 * lock;
      if (a <= 0.01) continue;
      const r = this.wide ? 2.3 : 2.1;
      ctx.fillStyle = rgba(col, 0.1 * a);
      ctx.beginPath();
      ctx.arc(pos[0], y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(col, 0.95 * a);
      ctx.beginPath();
      ctx.arc(pos[0], y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (coinStart > 0.01)
      this.drawCoin(this.wallet[0], this.wallet[1], this.coinR, time, coinStart, AMBER);
    if (coinEnd > 0.01)
      this.drawCoin(this.wallet[0], this.wallet[1], this.coinR, time, coinEnd, TEAL);
    ctx.save();
    ctx.translate(0, dy);
    if (barsSolid > 0.01) this.drawBars(barsSolid, p);
    if (cardSolid > 0.01) this.drawCard(cardSolid, time);
    this.drawBursts(p);
    ctx.restore();
  }

  // ------------------------------------------------------------------ pieces

  private lockAmount(p: number) {
    return seg(p, 0.26, 0.31) * (1 - seg(p, 0.4, 0.45));
  }

  private label(text: string, x: number, y: number, color: RGB = DIM, size = 13, weight = 500) {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px ${this.sans}`;
    ctx.fillStyle = rgba(color, 1);
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  }

  private rr(x: number, y: number, w: number, h: number, r: number) {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
  }

  private drawPath() {
    const { ctx } = this;
    const [wx, wy] = this.wallet;
    const v = this.vault;
    const ph = this.phone;
    ctx.save();
    ctx.setLineDash([3, 8]);
    ctx.strokeStyle = 'rgba(139,149,168,0.16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(lerp(wx, v.x, 0.5), Math.min(wy, v.y) - 150, v.x, v.y);
    ctx.quadraticCurveTo(lerp(v.x, ph.x, 0.5), Math.min(v.y, ph.y) - 170, ph.x, ph.y - ph.h * 0.12);
    ctx.stroke();
    ctx.restore();
  }

  private drawWallet(p: number) {
    const { ctx } = this;
    const [x, y] = this.wallet;
    const w = this.wide ? 200 : 180;
    const h = this.wide ? 140 : 126;
    const active = p < 0.12 || p > 0.94;
    ctx.save();
    // Back panel and a card peeking out.
    const back = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    back.addColorStop(0, '#2c2722');
    back.addColorStop(1, '#1a1714');
    this.rr(x - w / 2, y - h / 2, w, h, 18);
    ctx.fillStyle = back;
    ctx.fill();
    const peek = ctx.createLinearGradient(x - w / 2, 0, x + w / 4, 0);
    peek.addColorStop(0, '#3a3220');
    peek.addColorStop(1, '#5a4520');
    this.rr(x - w / 2 + 16, y - h / 2 - 12, w * 0.5, 34, 6);
    ctx.fillStyle = peek;
    ctx.fill();
    // Front pocket with stitching.
    const front = ctx.createLinearGradient(x, y - h * 0.2, x, y + h / 2);
    front.addColorStop(0, '#332d27');
    front.addColorStop(1, '#1c1915');
    this.rr(x - w / 2, y - h * 0.18, w, h * 0.68, 16);
    ctx.fillStyle = front;
    ctx.fill();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    this.rr(x - w / 2 + 7, y - h * 0.18 + 7, w - 14, h * 0.68 - 14, 11);
    ctx.stroke();
    ctx.setLineDash([]);
    // Clasp.
    this.rr(x + w / 2 - 38, y - 4, 38, 30, 9);
    ctx.fillStyle = '#3a332c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + w / 2 - 18, y + 11, 5, 0, Math.PI * 2);
    ctx.fillStyle = active ? rgba(AMBER, 0.9) : '#6b6258';
    ctx.fill();
    // Outline.
    this.rr(x - w / 2, y - h / 2, w, h, 18);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = active ? rgba(AMBER, 0.45) : 'rgba(255,255,255,0.06)';
    ctx.stroke();
    ctx.restore();
    this.label('Your wallet', x, y + h / 2 + 28);
    if (p < 0.1) this.label('1.04 QUSDC', x, y + h / 2 + 48, AMBER, 14);
    if (p > 0.95) this.label('Refunded 1.04 QUSDC', x, y + h / 2 + 48, TEAL, 14);
  }

  private drawCoin(x: number, y: number, r: number, time: number, alpha: number, halo: RGB) {
    const { ctx } = this;
    const tilt = this.reduce ? 1 : 0.86 + 0.14 * Math.cos(time / 900);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = rgba(halo, 0.55);
    ctx.shadowBlur = 36;
    ctx.translate(x, y - 6);
    ctx.scale(tilt, 1);
    // Edge (visible as the coin turns), rim and face.
    ctx.fillStyle = '#5e4628';
    ctx.beginPath();
    ctx.ellipse(2, 3, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    const rim = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
    rim.addColorStop(0, '#f1dcb0');
    rim.addColorStop(0.6, '#c9a46a');
    rim.addColorStop(1, '#7d6036');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    const face = ctx.createRadialGradient(r * 0.2, r * 0.3, r * 0.1, 0, 0, r * 0.8);
    face.addColorStop(0, '#b8925a');
    face.addColorStop(1, '#d4b47d');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    // Milled ring.
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(80,60,30,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `400 ${r * 1.05}px ${this.serif}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(60,44,22,0.9)';
    ctx.fillText('Q', 0, r * 0.06);
    ctx.textBaseline = 'alphabetic';
    // Moving glint.
    const a = this.reduce ? 0.6 : (time / 1400) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, a, a + 0.6);
    ctx.stroke();
    ctx.restore();
  }

  private drawVault(p: number, time: number) {
    const { ctx } = this;
    const { x, y, s } = this.vault;
    const lock = this.lockAmount(p);
    const open =
      seg(p, 0.41, 0.47) * (1 - seg(p, 0.6, 0.64)) + seg(p, 0.88, 0.9) * (1 - seg(p, 0.93, 0.95));
    ctx.save();
    if (lock > 0) {
      ctx.shadowColor = rgba(AMBER, 0.45 * lock * (0.8 + 0.2 * Math.sin(time / 300)));
      ctx.shadowBlur = 70 * lock;
    }
    const body = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
    body.addColorStop(0, '#34302a');
    body.addColorStop(1, '#141210');
    this.rr(x - s / 2, y - s / 2, s, s, 24);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Bevel.
    this.rr(x - s / 2 + 8, y - s / 2 + 8, s - 16, s - 16, 18);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Bolts.
    for (const [bx, by] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const g = ctx.createRadialGradient(
        x + bx * s * 0.38 - 1,
        y + by * s * 0.38 - 1,
        0,
        x + bx * s * 0.38,
        y + by * s * 0.38,
        5,
      );
      g.addColorStop(0, '#a49a8c');
      g.addColorStop(1, '#332e28');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x + bx * s * 0.38, y + by * s * 0.38, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Door: swings open on its left hinge.
    const r = s * 0.34;
    ctx.fillStyle = '#0b0a09';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x - r, y);
    ctx.scale(1 - open * 0.82, 1);
    ctx.translate(r, 0);
    const door = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    door.addColorStop(0, '#433d35');
    door.addColorStop(1, '#1b1815');
    ctx.fillStyle = door;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(lock > 0.5 ? AMBER : DIM, 0.35 + 0.55 * lock);
    ctx.lineWidth = 2;
    ctx.stroke();
    // Wheel handle.
    ctx.rotate((seg(p, 0.26, 0.32) - seg(p, 0.4, 0.46)) * Math.PI * 1.5);
    ctx.strokeStyle = rgba(lock > 0.5 ? AMBER : [176, 168, 156], 0.9);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
      ctx.lineTo(-Math.cos(a) * r * 0.62, -Math.sin(a) * r * 0.62);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#564e44';
    ctx.fill();
    ctx.restore();
    // Status light.
    const led = lock > 0.5 ? AMBER : open > 0.3 ? GREEN : DIM;
    ctx.save();
    ctx.shadowColor = rgba(led, 0.9);
    ctx.shadowBlur = 10;
    ctx.fillStyle = rgba(led, 1);
    ctx.beginPath();
    ctx.arc(x + s / 2 - 18, y - s / 2 + 18, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.label('Escrow contract', x, y + s / 2 + 28);
    this.label('QartaCheckout on QIE Mainnet', x, y + s / 2 + 46, DIM, 11, 400);
    if (lock > 0.6) this.label('Locked', x, y - s / 2 - 14, AMBER, 12);
    else if (open > 0.5 && p < 0.7) this.label('Released', x, y - s / 2 - 14, GREEN, 12);
  }

  private skin(x0: number, y0: number, x1: number, y1: number) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#3d3731');
    g.addColorStop(1, '#221e1a');
    return g;
  }

  private drawHandBack(dy: number, inAmt: number) {
    const { ctx } = this;
    const { x, y, w, h } = this.phone;
    ctx.save();
    ctx.translate(0, dy);
    ctx.globalAlpha = 0.4 + 0.6 * inAmt;
    ctx.fillStyle = this.skin(x - w * 0.6, y, x + w * 0.6, y + h);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1.5;
    // Palm and wrist, with the thumb's fleshy base bulging on the left.
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y + h * 0.2);
    ctx.bezierCurveTo(
      x - w * 0.78,
      y + h * 0.3,
      x - w * 0.74,
      y + h * 0.58,
      x - w * 0.5,
      y + h * 0.7,
    );
    ctx.bezierCurveTo(
      x - w * 0.42,
      y + h * 0.8,
      x - w * 0.4,
      y + h * 0.92,
      x - w * 0.34,
      y + h * 1.06,
    );
    ctx.lineTo(x + w * 0.4, y + h * 1.06);
    ctx.bezierCurveTo(
      x + w * 0.46,
      y + h * 0.86,
      x + w * 0.66,
      y + h * 0.62,
      x + w * 0.6,
      y + h * 0.16,
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawPhone(p: number, dy: number, inAmt: number) {
    const { ctx } = this;
    const { x, y, w, h } = this.phone;
    const s = this.screen;
    ctx.save();
    ctx.translate(0, dy);
    ctx.globalAlpha = 0.4 + 0.6 * inAmt;
    // Side buttons.
    ctx.fillStyle = '#332e28';
    this.rr(x - w / 2 - 3, y - h * 0.28, 4, 34, 2);
    ctx.fill();
    this.rr(x - w / 2 - 3, y - h * 0.18, 4, 50, 2);
    ctx.fill();
    this.rr(x + w / 2 - 1, y - h * 0.22, 4, 70, 2);
    ctx.fill();
    // Frame.
    const frame = ctx.createLinearGradient(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    frame.addColorStop(0, '#433d36');
    frame.addColorStop(0.5, '#1c1916');
    frame.addColorStop(1, '#36302a');
    this.rr(x - w / 2, y - h / 2, w, h, 38);
    ctx.fillStyle = frame;
    ctx.fill();
    // Screen.
    const scr = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    scr.addColorStop(0, '#161411');
    scr.addColorStop(1, '#0b0a09');
    this.rr(s.x, s.y, s.w, s.h, 28);
    ctx.fillStyle = scr;
    ctx.fill();
    // Dynamic island and status bar.
    this.rr(x - 36, s.y + 10, 72, 20, 10);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.font = `600 11px ${this.sans}`;
    ctx.fillStyle = 'rgba(245,247,250,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText('9:41', s.x + 18, s.y + 24);
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(s.x + s.w - 48 + k * 4, s.y + 24 - (k + 1) * 2.4, 3, (k + 1) * 2.4);
    }
    this.rr(s.x + s.w - 28, s.y + 16, 18, 9, 3);
    ctx.strokeStyle = 'rgba(245,247,250,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillRect(s.x + s.w - 26, s.y + 18, 12, 5);
    // Toasts on the screen.
    const toast = (text: string, color: RGB, t: number) => {
      if (t <= 0.01) return;
      const ty = s.y + 40 + (1 - easeOut(clamp(t * 1.6))) * -24;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.6) * (0.4 + 0.6 * inAmt);
      this.rr(s.x + 10, ty, s.w - 20, 36, 14);
      ctx.fillStyle = 'rgba(42,38,33,0.96)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s.x + 28, ty + 18, 6, 0, Math.PI * 2);
      ctx.fillStyle = rgba(color, 1);
      ctx.fill();
      ctx.font = `500 12px ${this.sans}`;
      ctx.fillStyle = rgba(INK, 0.95);
      ctx.textAlign = 'left';
      ctx.fillText(text, s.x + 42, ty + 22);
      ctx.restore();
    };
    toast('Airtime received · MTN', GREEN, seg(p, 0.64, 0.66) * (1 - seg(p, 0.7, 0.72)));
    toast('Gift card code ready', AMBER, seg(p, 0.77, 0.79) * (1 - seg(p, 0.84, 0.86)));
    toast('Delivery failed · refunding', RED, seg(p, 0.86, 0.88) * (1 - seg(p, 0.95, 0.97)));
    // Glare.
    ctx.save();
    this.rr(s.x, s.y, s.w, s.h, 28);
    ctx.clip();
    const glare = ctx.createLinearGradient(s.x, s.y, s.x + s.w, s.y + s.h * 0.6);
    glare.addColorStop(0, 'rgba(255,255,255,0.06)');
    glare.addColorStop(0.45, 'rgba(255,255,255,0)');
    ctx.fillStyle = glare;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.restore();
    // Hand in front: four overlapping fingers curl over the right edge, the thumb over the left.
    ctx.lineWidth = 1.2;
    for (let k = 3; k >= 0; k--) {
      const fy = y + h * (0.0 + k * 0.078);
      const fw = w * (0.26 - k * 0.018);
      const fh = h * 0.09;
      const fx = x + w * 0.36;
      ctx.fillStyle = this.skin(fx, fy, fx, fy + fh);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      this.rr(fx, fy, fw, fh, fh / 2);
      ctx.fill();
      ctx.stroke();
      // Knuckle crease and a soft highlight along the top of each finger.
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(fx + fw * 0.5, fy + fh * 0.22);
      ctx.quadraticCurveTo(fx + fw * 0.56, fy + fh * 0.5, fx + fw * 0.5, fy + fh * 0.78);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(fx + fh * 0.4, fy + fh * 0.2);
      ctx.lineTo(fx + fw - fh * 0.5, fy + fh * 0.2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x - w * 0.58, y + h * 0.36);
    ctx.rotate(-0.78);
    const tl = w * 0.6;
    const tt = w * 0.2;
    ctx.fillStyle = this.skin(0, -tt / 2, 0, tt / 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, -tt * 0.62);
    ctx.lineTo(tl - tt / 2, -tt / 2);
    ctx.arc(tl - tt / 2, 0, tt / 2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, tt * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Thumbnail and joint crease.
    this.rr(tl - tt * 1.05, -tt * 0.34, tt * 0.62, tt * 0.56, tt * 0.22);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(tl * 0.5, -tt * 0.42);
    ctx.quadraticCurveTo(tl * 0.54, 0, tl * 0.5, tt * 0.42);
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  private drawBars(alpha: number, p: number) {
    const { ctx } = this;
    const s = this.screen;
    ctx.save();
    ctx.globalAlpha = alpha;
    const grow = easeOut(seg(p, 0.64, 0.68));
    this.barRects.forEach((b, i) => {
      const hh = b.h * (0.6 + 0.4 * clamp(grow * 1.4 - i * 0.12));
      const g = ctx.createLinearGradient(0, b.y + b.h - hh, 0, b.y + b.h);
      g.addColorStop(0, '#b7d8bd');
      g.addColorStop(1, '#5f8f69');
      ctx.shadowColor = rgba(GREEN, 0.5);
      ctx.shadowBlur = 16;
      this.rr(b.x, b.y + b.h - hh, b.w, hh, 5);
      ctx.fillStyle = g;
      ctx.fill();
    });
    ctx.shadowBlur = 0;
    const base = this.barRects[0]!.y + this.barRects[0]!.h;
    ctx.font = `400 ${this.wide ? 34 : 30}px ${this.serif}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(GREEN, 1);
    ctx.fillText('+₦1,500', s.x + s.w / 2, base + 46);
    this.label('Airtime delivered', s.x + s.w / 2, base + 68, DIM, 12);
    ctx.restore();
  }

  private drawCard(alpha: number, time: number) {
    const { ctx } = this;
    const c = this.card;
    const s = this.screen;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = rgba(AMBER, 0.45);
    ctx.shadowBlur = 24;
    const g = ctx.createLinearGradient(c.x, c.y, c.x + c.w, c.y + c.h);
    g.addColorStop(0, '#e9d3a6');
    g.addColorStop(0.55, '#c9a46a');
    g.addColorStop(1, '#7d6036');
    this.rr(c.x, c.y, c.w, c.h, 12);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    // Chip.
    const chip = ctx.createLinearGradient(c.x + c.w * 0.1, 0, c.x + c.w * 0.28, 0);
    chip.addColorStop(0, '#f8e3b0');
    chip.addColorStop(1, '#c9a24f');
    this.rr(c.x + c.w * 0.1, c.y + c.h * 0.32, c.w * 0.18, c.h * 0.26, 4);
    ctx.fillStyle = chip;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,10,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c.x + c.w * 0.19, c.y + c.h * 0.32);
    ctx.lineTo(c.x + c.w * 0.19, c.y + c.h * 0.58);
    ctx.moveTo(c.x + c.w * 0.1, c.y + c.h * 0.45);
    ctx.lineTo(c.x + c.w * 0.28, c.y + c.h * 0.45);
    ctx.stroke();
    ctx.font = `600 10px ${this.sans}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(18,12,2,0.7)';
    ctx.fillText('GIFT CARD', c.x + c.w * 0.1, c.y + c.h * 0.22);
    ctx.font = `500 11px ${this.mono}`;
    ctx.fillText('•••• •••• 4F2A', c.x + c.w * 0.1, c.y + c.h * 0.84);
    // Shimmer sweep.
    ctx.save();
    this.rr(c.x, c.y, c.w, c.h, 12);
    ctx.clip();
    const sx = c.x - c.w + ((time / 1600) % 1) * c.w * 3;
    const sh = ctx.createLinearGradient(sx, 0, sx + c.w * 0.5, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.restore();
    this.label('Code ready to reveal', s.x + s.w / 2, c.y + c.h + 30, DIM, 12);
    ctx.restore();
  }

  /** A ring of sparks the moment a delivery shape settles. */
  private drawBursts(p: number) {
    const { ctx } = this;
    const s = this.screen;
    for (const [start, col, cy] of [
      [0.645, GREEN, this.barRects[0]!.y + this.barRects[0]!.h * 0.2],
      [0.775, AMBER, this.card.y + this.card.h / 2],
    ] as const) {
      const t = seg(p, start, start + 0.04);
      if (t <= 0 || t >= 1) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + hash(k, 3.1);
        const d = easeOut(t) * (s.w * 0.55) * (0.7 + 0.3 * hash(k, 9.7));
        ctx.fillStyle = rgba(col, 1 - t);
        ctx.beginPath();
        ctx.arc(
          s.x + s.w / 2 + Math.cos(a) * d,
          cy + Math.sin(a) * d,
          2.2 * (1 - t) + 0.6,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function q0(rects: Box[]): Box {
  return rects[0] ?? { x: 0, y: 0, w: 0, h: 0 };
}
