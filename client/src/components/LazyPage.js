import React, { Suspense } from 'react';
import ModuleLoading from './ModuleLoading';

/** Inline loader for sub-routes within an already-mounted module layout. */
export function RouteLoading({ module = 'sistema' }) {
  return <ModuleLoading module={module} inline />;
}

/**
 * Renders a code-split route component.
 * - compact routes rely on Layout's Outlet Suspense (single boundary for tab navigation).
 * - non-compact routes (login, etc.) get their own Suspense fallback.
 */
export function LazyPage({ component: Component, module = 'sistema', compact = false, ...props }) {
  const element = <Component {...props} />;

  if (compact) {
    return element;
  }

  const fallback = <ModuleLoading module={module} />;
  return (
    <Suspense fallback={fallback}>
      {element}
    </Suspense>
  );
}

export function withModuleSuspense(Component, module = 'sistema', { compact = false } = {}) {
  const fallback = compact
    ? <RouteLoading module={module} />
    : <ModuleLoading module={module} />;

  const Wrapped = (props) => (
    <Suspense fallback={fallback}>
      <Component {...props} />
    </Suspense>
  );
  Wrapped.displayName = `WithModuleSuspense(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
}
