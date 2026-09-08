import { useEffect, useState } from 'react';

export type Route = '/' | '/pricing';

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash === '/pricing') return '/pricing';
  return '/';
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

export function navigate(route: Route) {
  window.location.hash = route;
}
