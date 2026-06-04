"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { MessageAlert } from "@/components/product-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

type BootstrapState = {
  ownerConfigured: boolean;
};

type AuthState = "checking" | "setup" | "login" | "authenticated" | "bypass";

type Message = {
  kind: "success" | "error";
  text: string;
};

export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AuthGateFallback>{children}</AuthGateFallback>}>
      <AuthGateInner>{children}</AuthGateInner>
    </Suspense>
  );
}

function AuthGateFallback({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="min-h-svh blur-lg pointer-events-none select-none">{children}</div>
      <div className="fixed inset-0 z-50 grid place-items-center bg-background/82 p-4 backdrop-blur-xl">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Checking access</CardTitle>
            <CardDescription>Verifying owner session.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}

function AuthGateInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const signedReview = searchParams.get("review");
  const signedLink = searchParams.get("link");
  const isSignedReviewLink = pathname === "/reviews" && Boolean(signedReview && signedLink);
  const [state, setState] = useState<AuthState>("checking");
  const [message, setMessage] = useState<Message | null>(null);

  useEffect(() => {
    if (isSignedReviewLink) {
      setState("bypass");
      return;
    }
    void checkAccess();
  }, [isSignedReviewLink]);

  const title = useMemo(() => {
    if (state === "setup") {
      return "Set owner password";
    }
    return "Owner sign in";
  }, [state]);

  async function checkAccess() {
    setState("checking");
    const [bootstrapResponse, meResponse] = await Promise.all([
      fetch(`${apiBase}/settings/bootstrap`, { credentials: "include" }),
      fetch(`${apiBase}/auth/me`, { credentials: "include" })
    ]);
    const bootstrap = await bootstrapResponse.json() as BootstrapState;
    const me = await meResponse.json().catch(() => ({ authenticated: false }));
    if (!bootstrap.ownerConfigured) {
      setState("setup");
      return;
    }
    setState(me.authenticated ? "authenticated" : "login");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const path = state === "setup" ? "/auth/setup-owner" : "/auth/login";
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage({ kind: "error", text: data.message ?? "Access failed" });
      return;
    }
    setMessage({ kind: "success", text: state === "setup" ? "Owner password set" : "Signed in" });
    setState("authenticated");
  }

  return (
    <>
      <div className={state === "authenticated" || state === "bypass" ? "" : "min-h-svh blur-lg pointer-events-none select-none"}>
        {children}
      </div>
      {state !== "authenticated" && state !== "bypass" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/82 p-4 backdrop-blur-xl">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <LockKeyhole aria-hidden="true" />
              </div>
              <CardTitle>{state === "checking" ? "Checking access" : title}</CardTitle>
              <CardDescription>
                {state === "setup"
                  ? "Create the owner password for this deployment."
                  : "Use the owner password for this deployment."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-4" onSubmit={submit}>
                <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="auth-password">
                  {state === "setup" ? "New password" : "Password"}
                  <Input
                    id="auth-password"
                    name="password"
                    type="password"
                    minLength={state === "setup" ? 12 : undefined}
                    disabled={state === "checking"}
                    autoFocus={state !== "checking"}
                    required
                    className="h-11"
                  />
                </label>
                {message ? <MessageAlert kind={message.kind}>{message.text}</MessageAlert> : null}
                <Button size="lg" type="submit" disabled={state === "checking"}>
                  {state === "setup" ? "Set password" : "Sign in"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
