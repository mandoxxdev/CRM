import React, { Suspense } from 'react';
import ModuleLoading from './ModuleLoading';

/** Inline loader for sub-routes within an already-mounted module layout. */
export function RouteLoading({ module = 'sistema' }) {
  return <ModuleLoading module={module} inline />;
}

export function LazyPage({ component: Component, module = 'sistema', compact = false, ...props }) {
  const fallback = compact
    ? <RouteLoading module={module} />
    : <ModuleLoading module={module} />;

  return (
    <Suspense fallback={fallback}>
      <Component {...props} />
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
