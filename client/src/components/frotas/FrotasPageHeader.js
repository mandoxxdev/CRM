import React from 'react';
import { Link } from 'react-router-dom';
import { FiChevronRight, FiHome } from 'react-icons/fi';
import './Frotas.css';

const FrotasPageHeader = ({ title, subtitle, breadcrumbs = [], actions, children }) => (
  <>
    {breadcrumbs.length > 0 && (
      <nav className="frotas-breadcrumb" aria-label="Navegação">
        <Link to="/frota" className="frotas-breadcrumb-home" title="Dashboard Frota">
          <FiHome size={14} />
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={i}>
            <FiChevronRight size={12} className="frotas-breadcrumb-sep" />
            {crumb.to ? (
              <Link to={crumb.to}>{crumb.label}</Link>
            ) : (
              <span className="frotas-breadcrumb-current">{crumb.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
    )}

    <div className="frotas-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="frotas-header-actions">{actions}</div>}
    </div>
  </>
);

export default FrotasPageHeader;
