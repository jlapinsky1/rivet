export const SITE_URL = 'https://gosquatterz.com';
export const DEFAULT_OG_IMAGE = '/logo-squatterz.png';
export const makeCanonical = (path) => {
  if (path === '/') return `${SITE_URL}/`;
  const normalized = path.endsWith('/') ? path : `${path}/`;
  return `${SITE_URL}${normalized}`;
};
export const makeTitle = (page) => `${page} | Squatterz - Junk Removal Braselton GA`;
