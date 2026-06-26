import React from 'react';

const ProducaoPageHeader = ({ title, subtitle, actions }) => (
  <div className="producao-header">
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {actions && <div className="producao-header-actions">{actions}</div>}
  </div>
);

export default ProducaoPageHeader;
