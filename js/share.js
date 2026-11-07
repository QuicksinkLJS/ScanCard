// "My pulls" picture: the scanned cards with their prices and the total, shared with the phone's share sheet.

const W = 1080;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

const money = (lo, hi) => (lo == null ? '–' : (hi == null || Math.abs(hi - lo) < 0.005) ? `€${lo.toFixed(2)}` : `€${lo.toFixed(2)}–${hi.toFixed(2)}`);

// cards: [{name, canvas, price: {lo, hi, label}}], info: {title, sub, balance}
export function pullsImage(cards, info = {}) {
  const list = [...cards].sort((a, b) => (b.price?.hi ?? -1) - (a.price?.hi ?? -1)).slice(0, 12);
  const cols = list.length <= 1 ? 1 : list.length <= 4 ? 2 : 3;
  const pad = 56, gap = 28;
  const cw = (W - 2 * pad - gap * (cols - 1)) / cols;
  const ch = cw * 86 / 59;
  const rows = Math.ceil(list.length / cols);
  const cellH = ch + 104;
  const head = 230, foot = 230;
  const H = Math.round(head + rows * cellH + (rows - 1) * gap + foot);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const font = (w, px) => `${w} ${px}px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  // background
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#16131f'); g.addColorStop(1, '#0d0d11');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 0.8);
  glow.addColorStop(0, 'rgba(155,135,255,.35)'); glow.addColorStop(1, 'rgba(155,135,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // header
  ctx.fillStyle = '#fff'; ctx.font = font(800, 76); ctx.textBaseline = 'alphabetic';
  ctx.fillText(info.title || 'My pulls', pad, 118);
  ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = font(500, 34);
  ctx.fillText(fit(ctx, info.sub || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), W - 2 * pad), pad, 172);

  // cards
  const top = list[0];
  list.forEach((card, i) => {
    const x = pad + (i % cols) * (cw + gap);
    const y = head + Math.floor(i / cols) * (cellH + gap);
    ctx.save();
    if (card === top && (card.price?.lo ?? 0) >= 10) { ctx.shadowColor = 'rgba(255,200,90,.85)'; ctx.shadowBlur = 40; }
    else { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 24; }
    roundRect(ctx, x, y, cw, ch, cw * 0.045);
    ctx.fillStyle = '#222'; ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, y, cw, ch, cw * 0.045);
    ctx.clip();
    if (card.canvas) ctx.drawImage(card.canvas, x, y, cw, ch);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = font(800, cols === 1 ? 60 : cols === 2 ? 46 : 38);
    ctx.fillText(money(card.price?.lo, card.price?.hi), x, y + ch + 52);
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = font(500, cols === 3 ? 26 : 30);
    ctx.fillText(fit(ctx, card.name, cw), x, y + ch + 90);
  });

  // total
  const lo = cards.reduce((s, x) => s + (x.price?.lo || 0), 0);
  const hi = cards.reduce((s, x) => s + (x.price?.hi || 0), 0);
  const fy = H - foot + 70;
  ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.font = font(600, 32);
  ctx.fillText(`${cards.length} card${cards.length > 1 ? 's' : ''} · total`, pad, fy);
  ctx.fillStyle = '#fff'; ctx.font = font(800, 72);
  ctx.fillText(money(lo, hi), pad, fy + 78);
  if (info.balance) {
    ctx.textAlign = 'right';
    ctx.fillStyle = info.balance.startsWith('+') ? '#4fd08a' : '#ff7b7b';
    ctx.font = font(800, 64);
    ctx.fillText(info.balance, W - pad, fy + 74);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = font(600, 26);
  ctx.fillText('CardScan · Cardmarket trend prices', pad, H - 40);
  return c;
}

export async function sharePulls(cards, info) {
  const canvas = pullsImage(cards, info);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], `cardscan-pulls-${new Date().toISOString().slice(0, 10)}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'My pulls' }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return 'downloaded';
}
