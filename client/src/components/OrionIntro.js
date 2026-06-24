import React, { useState, useEffect, useCallback, useRef } from 'react';
import './OrionIntro.css';

const INTRO_DURATION_MS = 3200;
const ORION_LOGO_SRC = `${process.env.PUBLIC_URL || ''}/orion-logo.png`;

const OrionIntro = ({ onComplete }) => {
  const [fadeOut, setFadeOut] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [progress, setProgress] = useState(0);
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

    const contentTimer = setTimeout(() => setShowContent(true), 200);

    const startTime = performance.now();
    let rafId;
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min((elapsed / INTRO_DURATION_MS) * 100, 100);
      setProgress(pct);
      if (pct < 100) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    const completeTimer = setTimeout(complete, INTRO_DURATION_MS);

    return () => {
      clearTimeout(contentTimer);
      clearTimeout(completeTimer);
      cancelAnimationFrame(rafId);
      document.body.classList.remove('orion-intro-active');
      document.body.style.overflow = '';
    };
  }, [complete]);

  if (fadeOut) {
    return null;
  }

  return (
    <div className={`orion-intro ${fadeOut ? 'orion-intro--fade-out' : ''}`}>
      <div className="orion-intro__ambient" aria-hidden="true">
        <div className="orion-intro__glow orion-intro__glow--blue" />
        <div className="orion-intro__glow orion-intro__glow--orange" />
      </div>

      <div className={`orion-intro__hero ${showContent ? 'orion-intro__hero--visible' : ''}`}>
        <div className="orion-intro__logo-wrap">
          <div className="orion-intro__logo-glow" aria-hidden="true" />
          <img
            src={ORION_LOGO_SRC}
            alt="Orion"
            className="orion-intro__logo"
            draggable={false}
          />
        </div>
        <p className="orion-intro__tagline">Sistema de Gestão Industrial</p>
      </div>

      <div className="orion-intro__footer">
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
