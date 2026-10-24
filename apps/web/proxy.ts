import { NextResponse, type NextRequest } from "next/server";
import { ingressPolicy } from "./runtime-ingress.mjs";

export function proxy(request: NextRequest) {
  const policy = ingressPolicy(request.url, request.headers);
  const response = policy.redirect ? NextResponse.redirect(policy.redirect, 308)
    : policy.rewrite ? NextResponse.rewrite(policy.rewrite) : NextResponse.next();
  for (const [key, value] of Object.entries(policy.headers)) response.headers.set(key, value);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
