// Share card: draws a country/region season strip to a 1200×630 PNG.
import { weekClasses, verdict, CLASS_NAMES } from '../core/season.js';
import { MONTH_SHORT, todayDoy, YEAR_DAYS } from '../core/dates.js';
import { cssVar, toast } from '../lib/util.js';

export async function shareCard(country, region) {
  const W = 1200, H = 630, pad = 72;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const col = { bg: '#f7f4ee', text: '#1d1b18', muted: '#6b655c', best: '#2e9d6a', shoulder: '#e0a028', worst: '#d1495b', na: '#d6d0c5' };
  const display = cssVar('--font-display') || 'Georgia, serif';
  const sans = cssVar('--font-sans') || 'system-ui, sans-serif';
  await document.fonts?.ready;

  ctx.fillStyle = col.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.font = `64px ${sans}`;
  ctx.fillText(country.flag, pad, pad + 56);
  ctx.fillStyle = col.text;
  ctx.font = `650 58px ${display}`;
  ctx.fillText(country.name, pad + 92, pad + 52);
  if (country.regions.length > 1) {
    ctx.fillStyle = col.muted;
    ctx.font = `500 28px ${sans}`;
    ctx.fillText(region.name, pad + 94, pad + 94);
  }

  const v = verdict(region);
  ctx.font = `600 30px ${sans}`;
  let y = 250;
  if (v.best) { ctx.fillStyle = col.best; ctx.fillText(`Best: ${v.best}`, pad, y, W - pad * 2); y += 44; }
  if (v.avoid) { ctx.fillStyle = col.worst; ctx.fillText(`Avoid: ${v.avoid}`, pad, y, W - pad * 2); }

  // Strip
  const top = 380, h = 90, gap = 3, w = (W - pad * 2 - gap * 51) / 52;
  const weeks = weekClasses(region);
  weeks.forEach((wk, i) => {
    const x = pad + i * (w + gap);
    const name = CLASS_NAMES[wk.cls];
    ctx.fillStyle = col[name];
    roundRect(ctx, x, top, w, h, 4);
    if (name === 'shoulder' || name === 'worst') {
      // Pattern so the image isn't colour-only.
      ctx.save();
      roundRect(ctx, x, top, w, h, 4, true);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      for (let k = -h; k < w + h; k += 7) {
        ctx.beginPath();
        ctx.moveTo(x + k, top + (name === 'worst' ? 0 : h));
        ctx.lineTo(x + k + h, top + (name === 'worst' ? h : 0));
        ctx.stroke();
      }
      ctx.restore();
    }
  });
  const tx = pad + (todayDoy() / YEAR_DAYS) * (W - pad * 2);
  ctx.fillStyle = col.text;
  ctx.fillRect(tx - 1.5, top - 14, 3, h + 28);
  ctx.font = `600 18px ${sans}`;
  ctx.textAlign = 'center';
  ctx.fillText('today', tx, top - 22);
  ctx.fillStyle = col.muted;
  ctx.font = `500 20px ${sans}`;
  MONTH_SHORT.forEach((m, i) => ctx.fillText(m, pad + ((i + 0.5) / 12) * (W - pad * 2), top + h + 34));

  ctx.textAlign = 'left';
  ctx.font = `600 22px ${sans}`;
  let lx = pad;
  for (const [k, label] of [['best', 'Best'], ['shoulder', 'Shoulder'], ['worst', 'Avoid']]) {
    ctx.fillStyle = col[k];
    roundRect(ctx, lx, H - 64, 28, 18, 4);
    ctx.fillStyle = col.text;
    ctx.fillText(label, lx + 38, H - 48);
    lx += 160;
  }
  ctx.textAlign = 'right';
  ctx.font = `650 26px ${display}`;
  ctx.fillText('WhenToGo', W - pad, H - 46);

  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const name = `whentogo-${country.iso2.toLowerCase()}-${region.id}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `When to go: ${country.name}`, text: `${region.name} — ${location.href}` });
      return;
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Image downloaded');
}

function roundRect(ctx, x, y, w, h, r, pathOnly = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (!pathOnly) ctx.fill();
}
