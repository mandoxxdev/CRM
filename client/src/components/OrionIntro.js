import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import './OrionIntro.css';

const OrionBirdScene = lazy(() => import('./OrionBirdScene'));

const INTRO_DURATION_MS = 3500;

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function OrionFallback() {
  return (
    <div className="orion-intro__fallback" aria-hidden="true">
      <div className="orion-fallback__stars" />
      <svg className="orion-fallback__bird" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="orionWingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5eb8ff" />
            <stop offset="100%" stopColor="#d4a853" />
          </linearGradient>
          <filter id="orionGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="orion-fallback__bird-body" filter="url(#orionGlow)">
          <ellipse cx="100" cy="58" rx="28" ry="14" fill="url(#orionWingGrad)" opacity="0.9" />
          <circle cx="118" cy="52" r="10" fill="#d4a853" />
          <polygon points="130,50 142,48 130,54" fill="#f0d080" />
          <path className="orion-fallback__wing orion-fallback__wing--left" d="M 88 52 Q 40 20 20 45 Q 50 55 88 58 Z" fill="#5eb8ff" opacity="0.85" />
          <path className="orion-fallback__wing orion-fallback__wing--right" d="M 88 52 Q 40 84 20 59 Q 50 55 88 58 Z" fill="#5eb8ff" opacity="0.85" />
          <path d="M 72 58 Q 50 62 38 70" stroke="#5eb8ff" strokeWidth="3" fill="none" opacity="0.6" />
        </g>
      </svg>
      <div className="orion-fallback__constellation">
        <span /><span /><span /><span /><span /><span /><span />
      </div>
    </div>
  );
}

const OrionIntro = ({ onComplete }) => {
  const [fadeOut, setFadeOut] = useState(false);
  const [showText, setShowText] = useState(false);
  const [progress, setProgress] = useState(0);
  const [webgl] = useState(() => supportsWebGL());
  const completingRef = useRef(false);

  const complete = useCallback(() => {
    if (completingRef.current) return;
    completingRef.current = true;
    setFadeOut(true);
    setTimeout(() => {
      onComplete();
    }, 650);
  }, [onComplete]);

  const handleSkip = useCallback(() => {
    complete();
  }, [complete]);

  useEffect(() => {
    document.body.classList.add('orion-intro-active');
    document.body.style.overflow = 'hidden';

    const textTimer = setTimeout(() => setShowText(true), 1100);

    const startTime = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min((elapsed / INTRO_DURATION_MS) * 100, 100);
      setProgress(pct);
      if (pct < 100) {
        requestAnimationFrame(tick);
      }
    };
    const raf = requestAnimationFrame(tick);

    const completeTimer = setTimeout(complete, INTRO_DURATION_MS);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(completeTimer);
      cancelAnimationFrame(raf);
      document.body.classList.remove('orion-intro-active');
      document.body.style.overflow = '';
    };
  }, [complete]);

  if (fadeOut) {
    return null;
  }

  return (
    <div className={`orion-intro ${fadeOut ? 'orion-intro--fade-out' : ''}`}>
      {webgl ? (
        <Suspense fallback={<OrionFallback />}>
          <OrionBirdScene />
        </Suspense>
      ) : (
        <OrionFallback />
      )}

      <div className="orion-intro__vignette" aria-hidden="true" />

      <div className="orion-intro__overlay">
        <div className={`orion-intro__brand ${showText ? 'orion-intro__brand--visible' : ''}`}>
          <h1 className="orion-intro__title">ORION</h1>
          <p className="orion-intro__subtitle">Sistema de Gestão Industrial</p>
        </div>

        <div className="orion-intro__progress" aria-hidden="true">
          <div className="orion-intro__progress-track">
            <div
              className="orion-intro__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          className="orion-intro__skip"
          onClick={handleSkip}
          aria-label="Pular introdução"
        >
          Pular
        </button>
      </div>
    </div>
  );
};

export default OrionIntro;
