import React from 'react';
import './FloatingBallsBackground.css';

const seededRandom = (seed) => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

const BALL_COUNT = 20;

const generateBalls = () => {
  const balls = [];
  for (let i = 0; i < BALL_COUNT; i++) {
    const r1 = seededRandom(i + 1);
    const r2 = seededRandom(i + 100);
    const r3 = seededRandom(i + 200);
    const r4 = seededRandom(i + 300);
    const r5 = seededRandom(i + 400);

    const depth = r1;
    const size = 36 + r2 * 240;
    const blur = depth < 0.3 ? 5 + r3 * 5 : depth < 0.6 ? 1.5 + r3 * 3 : 0;
    const opacity = 0.35 + depth * 0.6;
    const layer = depth < 0.3 ? 'back' : depth < 0.6 ? 'mid' : 'front';

    balls.push({
      id: i,
      size,
      left: r2 * 88 + 4,
      top: r3 * 88 + 4,
      blur,
      opacity,
      duration: 20 + r4 * 28,
      delay: r5 * -24,
      driftX: 12 + r1 * 30,
      driftY: 10 + r2 * 24,
      layer,
    });
  }
  return balls;
};

const BALLS = generateBalls();

const FloatingBallsBackground = () => (
  <div className="floating-balls-bg" aria-hidden="true">
    {BALLS.map((ball) => (
      <div
        key={ball.id}
        className={`floating-balls-bg__ball floating-balls-bg__ball--${ball.layer}`}
        style={{
          '--ball-size': `${ball.size}px`,
          '--ball-left': `${ball.left}%`,
          '--ball-top': `${ball.top}%`,
          '--ball-blur': `${ball.blur}px`,
          '--ball-opacity': ball.opacity,
          '--ball-duration': `${ball.duration}s`,
          '--ball-delay': `${ball.delay}s`,
          '--ball-drift-x': `${ball.driftX}px`,
          '--ball-drift-y': `${ball.driftY}px`,
        }}
      />
    ))}
  </div>
);

export default FloatingBallsBackground;
