import { useEffect, useRef } from 'react';
import { beatHud } from './store';

/**
 * The timing mini-game, front and centre. A marker sweeps the rail and the lit
 * band at the end is the window to click in. Animated by hand on every frame
 * rather than through React state, so the sweep stays smooth.
 */
export function BeatBar() {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const grace = useRef<HTMLDivElement>(null);
  const needle = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    let lastHit = beatHud.hitPulse;
    let lastMiss = beatHud.missPulse;
    let flash = 0;
    let flashGood = true;
    let lastWindow = -1;
    let lastGrace = -1;
    let lastLabel = '';
    // The sim only ticks 20x a second, so carry our own copy of the swing
    // forward every frame and steer it gently back onto the real value.
    let shown = 0;
    let wasActive = false;

    let trackW = 0;
    const measure = () => {
      trackW = track.current?.clientWidth ?? 0;
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = root.current;
      if (!el) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;

      if (beatHud.hitPulse !== lastHit) {
        lastHit = beatHud.hitPulse;
        flash = 0.34;
        flashGood = true;
      }
      if (beatHud.missPulse !== lastMiss) {
        lastMiss = beatHud.missPulse;
        flash = 0.34;
        flashGood = false;
      }
      flash = Math.max(0, flash - dt);

      const on = beatHud.active || flash > 0;
      el.classList.toggle('on', on);
      if (!on) {
        wasActive = false;
        return;
      }

      const target = Math.max(0, Math.min(1, beatHud.frac));
      if (!wasActive || target < shown - 0.12 || Math.abs(target - shown) > 0.3) {
        shown = target; // fresh swing, or we drifted badly — just jump
      } else {
        shown = Math.min(1, shown + beatHud.rate * dt);
        shown += (target - shown) * Math.min(1, dt * 8);
      }
      wasActive = true;

      const p = Math.max(0, Math.min(1, shown));
      const inWindow = p >= 1 - beatHud.window;
      const inGrace = p >= 1 - beatHud.window - beatHud.grace;

      if (beatHud.window !== lastWindow || beatHud.grace !== lastGrace) {
        lastWindow = beatHud.window;
        lastGrace = beatHud.grace;
        if (zone.current) zone.current.style.width = `${beatHud.window * 100}%`;
        if (grace.current) {
          grace.current.style.right = `${beatHud.window * 100}%`;
          grace.current.style.width = `${beatHud.grace * 100}%`;
        }
      }
      if (beatHud.label !== lastLabel && label.current) {
        lastLabel = beatHud.label;
        label.current.textContent = beatHud.label;
      }
      if (fill.current) fill.current.style.transform = `scaleX(${Math.max(0.001, p)})`;
      if (needle.current) needle.current.style.transform = `translate3d(${(p * trackW).toFixed(2)}px,0,0)`;

      el.classList.toggle('in-window', inWindow && !beatHud.hit);
      el.classList.toggle('in-grace', inGrace && !beatHud.hit);
      el.classList.toggle('banked', beatHud.hit);
      el.classList.toggle('penalty', beatHud.penalty);
      el.classList.toggle('flash-good', flash > 0 && flashGood);
      el.classList.toggle('flash-miss', flash > 0 && !flashGood);
      el.style.setProperty('--flash', String(flash / 0.34));
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="beat" ref={root}>
      <div className="beat-head">
        <span className="beat-label" ref={label} />
        <span className="beat-penalty-tag">slowed — missed the beat</span>
      </div>
      <div className="beat-track" ref={track}>
        <div className="beat-fill" ref={fill} />
        <div className="beat-grace" ref={grace} />
        <div className="beat-zone" ref={zone}>
          <span>HIT</span>
        </div>
        <div className="beat-needle" ref={needle} />
      </div>
      <div className="beat-tip">
        <span className="beat-tip-wait">Press Space or E while the marker is in the green</span>
        <span className="beat-tip-now">Now — Space or E!</span>
        <span className="beat-tip-done">Beat banked · stay put</span>
      </div>
    </div>
  );
}
