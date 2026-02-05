import React from 'react';
import './SkeletonLoader.css';

export const SkeletonCard = () => (
  <div className="skeleton-card">
    <div className="skeleton-header">
      <div className="skeleton-avatar"></div>
      <div className="skeleton-text-group">
        <div className="skeleton-line skeleton-title"></div>
        <div className="skeleton-line skeleton-subtitle"></div>
      </div>
    </div>
    <div className="skeleton-content">
      <div className="skeleton-line"></div>
      <div className="skeleton-line"></div>
      <div className="skeleton-line skeleton-short"></div>
    </div>
  </div>
);

export const SkeletonTable = ({ rows = 5, columns = 4 }) => (
  <div className="skeleton-table">
    <div className="skeleton-table-header">
      {Array.from({ length: columns }).map((_, i) => (
        <div key={i} className="skeleton-table-header-cell"></div>
      ))}
    </div>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="skeleton-table-row">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <div key={colIndex} className="skeleton-table-cell">
            <div className="skeleton-line"></div>
          </div>
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonList = ({ items = 5 }) => (
  <div className="skeleton-list">
    {Array.from({ length: items }).map((_, i) => (
      <div key={i} className="skeleton-list-item">
        <div className="skeleton-avatar-small"></div>
        <div className="skeleton-text-group">
          <div className="skeleton-line skeleton-title"></div>
          <div className="skeleton-line skeleton-subtitle"></div>
        </div>
      </div>
    ))}
  </div>
);

export const SkeletonChart = () => (
  <div className="skeleton-chart">
    <div className="skeleton-chart-header">
      <div className="skeleton-line skeleton-title"></div>
      <div className="skeleton-line skeleton-subtitle"></div>
    </div>
    <div className="skeleton-chart-content">
      <div className="skeleton-bars">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-bar" style={{ height: `${Math.random() * 60 + 20}%` }}></div>
        ))}
      </div>
    </div>
  </div>
);

export default SkeletonCard;




