import React, { useState, useRef, useEffect } from 'react';
import './Tooltip.css';

const Tooltip = ({ 
  children, 
  content, 
  position = 'top', 
  delay = 200,
  disabled = false,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(position);
  const tooltipRef = useRef(null);
  const wrapperRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const calculatePosition = () => {
    if (!tooltipRef.current || !wrapperRef.current) return;

    const tooltip = tooltipRef.current;
    const wrapper = wrapperRef.current;
    const rect = wrapper.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newPosition = position;

    // Verificar se precisa ajustar horizontalmente
    if (position === 'top' || position === 'bottom') {
      if (rect.left + tooltipRect.width / 2 > viewportWidth) {
        newPosition = position === 'top' ? 'top-right' : 'bottom-right';
      } else if (rect.right - tooltipRect.width / 2 < 0) {
        newPosition = position === 'top' ? 'top-left' : 'bottom-left';
      }
    }

    // Verificar se precisa ajustar verticalmente
    if (position === 'left' || position === 'right') {
      if (rect.top + tooltipRect.height / 2 > viewportHeight) {
        newPosition = position === 'left' ? 'left-bottom' : 'right-bottom';
      } else if (rect.bottom - tooltipRect.height / 2 < 0) {
        newPosition = position === 'left' ? 'left-top' : 'right-top';
      }
    }

    setTooltipPosition(newPosition);
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
      setTimeout(calculatePosition, 10);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  if (!content || disabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      className={`tooltip-wrapper ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`tooltip tooltip-${tooltipPosition}`}
          role="tooltip"
        >
          <div className="tooltip-content">
            {content}
          </div>
          <div className={`tooltip-arrow tooltip-arrow-${tooltipPosition}`} />
        </div>
      )}
    </div>
  );
};

export default Tooltip;


