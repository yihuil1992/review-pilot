export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function appHref(path: string): string {
  if (path === "/" || path.endsWith("/")) {
    return path;
  }

  const queryIndex = path.indexOf("?");
  if (queryIndex === -1) {
    return `${path}/`;
  }

  return `${path.slice(0, queryIndex)}/${path.slice(queryIndex)}`;
}

export function publicAsset(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${publicBasePath}${normalizedPath}`;
}
