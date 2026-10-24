export function ingressPolicy(requestUrl: string, headers: Headers, env?: NodeJS.ProcessEnv): {
  redirect?: string;
  rewrite?: string;
  headers: Record<string, string>;
};
