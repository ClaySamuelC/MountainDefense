import * as THREE from 'three';
import { BEAT_WINDOW } from '@shared';

/** Soft radial falloff, so additive halos read as light and not as squares. */
let glowTexture: THREE.CanvasTexture | null = null;

export function radialGlow(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowTexture = tex;
  return tex;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/**
 * The static face of the timing bar: a dark rail with the beat window painted
 * on as a labelled green band. Drawn once, then reused by every work bar.
 */
let beatTrackTexture: THREE.CanvasTexture | null = null;

function beatTrack(): THREE.CanvasTexture {
  if (beatTrackTexture) return beatTrackTexture;
  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const pad = 8;
  const bodyH = 74;
  const bodyY = (H - bodyH) / 2;

  // Casing
  ctx.fillStyle = 'rgba(8,9,14,0.93)';
  roundRect(ctx, pad, bodyY, W - pad * 2, bodyH, 26);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.26)';
  ctx.stroke();

  // Groove the needle runs along
  const gx = pad + 10;
  const gy = bodyY + 10;
  const gw = W - (pad + 10) * 2;
  const gh = bodyH - 20;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, gx, gy, gw, gh, 18);
  ctx.fill();

  // Beat window: the band you are aiming for, at the end of the sweep
  const zoneW = gw * BEAT_WINDOW;
  const zoneX = gx + gw - zoneW;
  ctx.save();
  roundRect(ctx, gx, gy, gw, gh, 18);
  ctx.clip();
  const grad = ctx.createLinearGradient(zoneX, 0, gx + gw, 0);
  grad.addColorStop(0, 'rgba(74,226,144,0.30)');
  grad.addColorStop(1, 'rgba(74,226,144,0.70)');
  ctx.fillStyle = grad;
  ctx.fillRect(zoneX, gy, zoneW, gh);
  // Hard leading edge so the moment to click is unmistakable
  ctx.fillStyle = '#b6ffd4';
  ctx.fillRect(zoneX - 2, gy, 5, gh);
  ctx.restore();

  ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(6,26,15,0.85)';
  ctx.fillText('HIT', zoneX + zoneW / 2, H / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  beatTrackTexture = tex;
  return tex;
}

const BAR_W = 2.5;
const BAR_H = BAR_W * (128 / 512);
/** Usable travel inside the casing, matching the groove in the texture. */
const BAR_INNER = BAR_W * ((512 - 36) / 512);

function flatSprite(color: string, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ color, depthTest: false, transparent: true, opacity }),
  );
  return s;
}

/**
 * Row of pips showing how many charges sit in the blast furnace. It has to be a
 * single sprite: separate sprites offset in world space would step diagonally
 * across the screen under the isometric camera.
 */
export function makeChargePips(count: number): { group: THREE.Group; set: (n: number) => void } {
  const W = 256;
  const H = 56;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  );
  sprite.scale.set(1.7, 1.7 * (H / W), 1);
  sprite.renderOrder = 12;
  const group = new THREE.Group();
  group.add(sprite);

  let drawn = -1;
  const draw = (n: number) => {
    ctx.clearRect(0, 0, W, H);
    const pad = 6;
    const gap = 5;
    const pw = (W - pad * 2 - gap * (count - 1)) / count;
    for (let i = 0; i < count; i++) {
      const x = pad + i * (pw + gap);
      const lit = i < n;
      roundRect(ctx, x, pad + 8, pw, H - (pad + 8) * 2, 5);
      ctx.fillStyle = lit ? '#ffb043' : 'rgba(20,22,30,0.75)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = lit ? 'rgba(255,225,170,0.85)' : 'rgba(255,255,255,0.16)';
      ctx.stroke();
    }
    tex.needsUpdate = true;
  };

  return {
    group,
    set(n: number) {
      const clamped = Math.max(0, Math.min(count, Math.round(n)));
      if (clamped !== drawn) {
        drawn = clamped;
        draw(clamped);
      }
    },
  };
}

/**
 * Timing bar above a working player. A needle sweeps the rail left to right
 * and the green band at the end is the window to click in; the band lights up
 * while the needle is inside it and locks gold once the beat is banked.
 */
export function makeWorkBar(): {
  group: THREE.Group;
  set: (
    pct: number | null,
    opts?: { beatWindow?: number; beatHit?: boolean; penalty?: boolean },
  ) => void;
  pop: (good?: boolean) => void;
  update: (dt: number) => void;
} {
  const group = new THREE.Group();

  const track = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: beatTrack(), depthTest: false, transparent: true }),
  );
  track.scale.set(BAR_W, BAR_H, 1);
  track.renderOrder = 20;

  // Progress trail behind the needle
  const fill = flatSprite('#ffc357', 0.42);
  fill.center.set(0, 0.5);
  fill.position.x = -BAR_INNER / 2;
  fill.scale.set(0.001, BAR_H * 0.42, 1);
  fill.renderOrder = 21;

  // Brightens while the needle sits in the window
  const zone = flatSprite('#8dffc0', 0);
  zone.scale.set(BAR_INNER * BEAT_WINDOW, BAR_H * 0.5, 1);
  zone.position.x = (BAR_INNER * (1 - BEAT_WINDOW)) / 2;
  zone.renderOrder = 22;

  const needle = flatSprite('#ffffff', 1);
  needle.scale.set(0.075, BAR_H * 0.66, 1);
  needle.renderOrder = 24;

  const glow = flatSprite('#ffffff', 0);
  glow.scale.set(BAR_W, BAR_H, 1);
  glow.renderOrder = 25;

  group.add(track, fill, zone, needle, glow);
  group.visible = false;

  const trackMat = track.material as THREE.SpriteMaterial;
  const fillMat = fill.material as THREE.SpriteMaterial;
  const zoneMat = zone.material as THREE.SpriteMaterial;
  const needleMat = needle.material as THREE.SpriteMaterial;
  const glowMat = glow.material as THREE.SpriteMaterial;

  const penaltyTint = new THREE.Color('#ffb0a0');
  let flash = 0;
  let flashGood = true;

  return {
    group,
    set(pct, opts) {
      if (pct === null) {
        if (flash <= 0) group.visible = false;
        return;
      }
      group.visible = true;
      const p = Math.max(0, Math.min(1, pct));
      const bw = opts?.beatWindow ?? 0;
      const inWindow = bw > 0 && p >= 1 - bw;
      const banked = !!opts?.beatHit;

      trackMat.color.set('#ffffff');
      if (opts?.penalty) trackMat.color.copy(penaltyTint);

      fill.scale.x = Math.max(0.001, BAR_INNER * p);
      fillMat.color.set(banked ? '#ffe08a' : '#ffc357');

      needle.position.x = -BAR_INNER / 2 + BAR_INNER * p;
      needle.visible = bw > 0;
      needleMat.color.set(banked ? '#fff3c4' : inWindow ? '#eaffef' : '#ffffff');

      if (banked) {
        zoneMat.color.set('#ffd76a');
        zoneMat.opacity = 0.5 + Math.sin(performance.now() / 120) * 0.12;
      } else if (inWindow) {
        zoneMat.color.set('#8dffc0');
        zoneMat.opacity = 0.42 + Math.sin(performance.now() / 70) * 0.16;
      } else {
        zoneMat.opacity = 0;
      }
      zone.visible = bw > 0;
    },
    pop(good = true) {
      flash = good ? 0.3 : 0.22;
      flashGood = good;
      group.visible = true;
    },
    update(dt: number) {
      if (flash <= 0) return;
      flash = Math.max(0, flash - dt);
      const t = flash / 0.3;
      glowMat.color.set(flashGood ? '#ffffff' : '#ff7a5c');
      glowMat.opacity = t * (flashGood ? 0.75 : 0.6);
      const s = 1 + t * (flashGood ? 0.16 : 0.06);
      // A miss shudders sideways; a hit swells.
      group.scale.set(s, s, 1);
      group.position.x = flashGood ? 0 : Math.sin(flash * 90) * 0.06;
      if (flash <= 0) {
        glowMat.opacity = 0;
        group.scale.set(1, 1, 1);
        group.position.x = 0;
      }
    },
  };
}

/**
 * Inverted-hull glow outline for an interactable object. Clones the target's
 * meshes, flips them inside out, and tints them gold.
 */
export function makeOutline(source: THREE.Group, color = '#ffd76a'): THREE.Group {
  const outline = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  source.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(source.matrixWorld).invert();
  source.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
    if (obj.parent && !obj.parent.visible) return;
    const m = new THREE.Mesh(obj.geometry, mat);
    m.matrixAutoUpdate = false;
    m.matrix.multiplyMatrices(inv, obj.matrixWorld);
    // grow slightly around the mesh's own center
    const scale = new THREE.Matrix4().makeScale(1.07, 1.07, 1.07);
    m.matrix.multiply(scale);
    outline.add(m);
  });
  outline.renderOrder = 1;
  return outline;
}

/** Crisp pill health bar drawn on a canvas texture so edges stay clean. */
export function makeHealthBar(width = 1.6): {
  group: THREE.Group;
  set: (pct: number) => void;
} {
  const W = 128;
  const H = 18;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, width * (H / W) * 1.15, 1);
  sprite.renderOrder = 12;
  const group = new THREE.Group();
  group.add(sprite);
  group.renderOrder = 12;

  const paint = (pct: number) => {
    const p = Math.max(0, Math.min(1, pct));
    ctx.clearRect(0, 0, W, H);
    const pad = 1.5;
    const rr = H / 2 - pad;
    // Track
    ctx.fillStyle = 'rgba(12, 14, 18, 0.78)';
    roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, rr);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, rr);
    ctx.stroke();
    // Fill
    const innerPad = 3.2;
    const maxW = W - innerPad * 2;
    const fillW = Math.max(0, maxW * p);
    if (fillW > 0.5) {
      const hue = 110 * p; // red → green
      const grad = ctx.createLinearGradient(innerPad, 0, innerPad + fillW, 0);
      grad.addColorStop(0, `hsl(${hue}, 72%, 42%)`);
      grad.addColorStop(1, `hsl(${hue + 12}, 78%, 54%)`);
      ctx.fillStyle = grad;
      roundRect(ctx, innerPad, innerPad, fillW, H - innerPad * 2, (H - innerPad * 2) / 2);
      ctx.fill();
    }
    tex.needsUpdate = true;
  };
  paint(1);

  return {
    group,
    set(pct: number) {
      const p = Math.max(0, Math.min(1, pct));
      paint(p);
      group.visible = p < 0.999;
    },
  };
}
