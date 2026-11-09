import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { makePark, type ParkScene, type ParkAssets } from './parkScene';
import parkBase from './assets/park_base.webp';
import parkCanopy from './assets/park_canopy.webp';
import parkWalkers from './assets/park_walkers.png';
import parkMask from './assets/park_mask.png';
import nightMp4 from './assets/night.mp4';
import nightWebm from './assets/night.webm';
import nightPoster from './assets/night_poster.jpg';
import nightMask from './assets/night_mask.png';

const DAY: ParkAssets = { base: parkBase, canopy: parkCanopy, walkers: parkWalkers };
const FADE_MS = 600;

// Day fills the column at 2:1 (1774 x 887). Night is exactly as tall, just narrower: 50% x 836/470 = 88.936% of the width.
const NIGHT_WIDTH = `${((0.5 * 836) / 470 * 100).toFixed(3)}%`;
const mask = (url: string): CSSProperties => ({
  WebkitMaskImage: `url(${url})`, WebkitMaskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat',
  maskImage: `url(${url})`, maskSize: '100% 100%', maskRepeat: 'no-repeat',
});

export interface PortfolioIllustrationProps {
  /** Pass your existing theme state. 'light' shows Central Park, 'dark' the fire escape film. */
  theme: 'light' | 'dark';
  className?: string;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * Day: The Mall in Central Park, alive (leaves, canopy, sun and shade, walkers, a bird).
 * Night: Manhattan from a rainy fire escape (the supplied video, played as-is).
 * Crossfades over 600ms when the theme changes. Only the visible scene runs.
 */
function PortfolioIllustrationImpl({ theme, className }: PortfolioIllustrationProps) {
  const dayWrapRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLCanvasElement>(null);
  const nightWrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const day = useRef<ParkScene>();
  const dark = theme === 'dark';
  const reduced = useReducedMotion();

  // day scene
  useEffect(() => {
    if (!dayWrapRef.current || !dayRef.current) return;
    day.current = makePark(dayWrapRef.current, dayRef.current, DAY);
    return () => { day.current?.destroy(); day.current = undefined; };
  }, []);
  useEffect(() => {
    const d = day.current;
    if (!d) return;
    if (!dark) { d.setActive(true); return; }
    const id = window.setTimeout(() => d.setActive(false), FADE_MS + 50);
    return () => window.clearTimeout(id);
  }, [dark]);

  // night film (unchanged): plays only while night is showing, the tab is visible and it's on screen
  useEffect(() => {
    const v = videoRef.current, wrap = nightWrapRef.current;
    if (!v || !wrap) return;
    v.muted = true; v.defaultMuted = true;
    let onScreen = true;
    const sync = () => {
      if (reduced) { v.pause(); if (v.currentTime > 0) v.currentTime = 0; return; }
      if (dark && !document.hidden && onScreen) v.play().catch(() => {});
      else v.pause();
    };
    const timer = dark ? 0 : window.setTimeout(sync, FADE_MS + 50);
    if (dark) sync();
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }) : null;
    io?.observe(wrap);
    document.addEventListener('visibilitychange', sync);
    v.addEventListener('canplay', sync);
    return () => {
      window.clearTimeout(timer);
      io?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      v.removeEventListener('canplay', sync);
    };
  }, [dark, reduced]);

  // The active scene sits in the flow and sizes the frame; the other floats on top while it fades out.
  const place = (active: boolean): CSSProperties => active
    ? { position: 'relative' }
    : { position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)' };

  return (
    <div
      className={className}
      role="img"
      aria-label={dark
        ? 'View of the Manhattan skyline at night from a rainy fire escape, apartment lights turning on and off across the city'
        : 'Pixel-art painting of The Mall in Central Park in autumn: an avenue of orange and gold trees, lamps and benches, leaves drifting down and two people walking into the distance'}
      style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
    >
      <div
        ref={dayWrapRef}
        aria-hidden="true"
        style={{ ...place(!dark), width: '100%', aspectRatio: '1774 / 887', flex: 'none', opacity: dark ? 0 : 1, transition: `opacity ${FADE_MS}ms ease`, pointerEvents: 'none', ...mask(parkMask) }}
      >
        <canvas ref={dayRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', opacity: 0, transition: 'opacity 0.7s ease' }} />
      </div>
      <div
        ref={nightWrapRef}
        aria-hidden="true"
        style={{ ...place(dark), width: NIGHT_WIDTH, aspectRatio: '836 / 470', flex: 'none', opacity: dark ? 1 : 0, transition: `opacity ${FADE_MS}ms ease`, pointerEvents: 'none', ...mask(nightMask) }}
      >
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          poster={nightPoster}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        >
          <source src={nightWebm} type="video/webm" />
          <source src={nightMp4} type="video/mp4" />
        </video>
      </div>
    </div>
  );
}

export const PortfolioIllustration = memo(PortfolioIllustrationImpl);
export default PortfolioIllustration;
