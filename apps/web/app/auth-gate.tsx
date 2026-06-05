"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { MessageAlert } from "@/components/product-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { demoMode } from "@/lib/demo-mode";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";
const authCheckOverlayDelayMs = 450;
const ownerAuthHintKey = "review-pilot.owner-authenticated";

type BootstrapState = {
  ownerConfigured: boolean;
};

type AuthState = "checking" | "setup" | "login" | "authenticated" | "bypass";

type Message = {
  kind: "success" | "error";
  text: string;
};

export function AuthGate({ children, bypass = false }: { children: React.ReactNode; bypass?: boolean }) {
  return <AuthGateInner bypass={bypass}>{children}</AuthGateInner>;
}

export function SignedReviewAuthGate({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AuthGateFallback>{children}</AuthGateFallback>}>
      <SignedReviewAuthGateInner>{children}</SignedReviewAuthGateInner>
    </Suspense>
  );
}

function AuthGateFallback({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function SignedReviewAuthGateInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const signedReview = searchParams.get("review");
  const signedLink = searchParams.get("link");
  return <AuthGate bypass={Boolean(signedReview && signedLink)}>{children}</AuthGate>;
}

function AuthGateInner({ children, bypass }: { children: React.ReactNode; bypass: boolean }) {
  const [state, setState] = useState<AuthState>("checking");
  const [message, setMessage] = useState<Message | null>(null);
  const [showCheckingOverlay, setShowCheckingOverlay] = useState(false);

  useEffect(() => {
    setMessage(null);
    setShowCheckingOverlay(false);

    if (demoMode) {
      setState("bypass");
      return;
    }
    if (bypass) {
      setState("bypass");
      return;
    }

    const controller = new AbortController();
    const hasOwnerAuthHint = readOwnerAuthHint();
    const overlayTimer = hasOwnerAuthHint
      ? undefined
      : window.setTimeout(() => {
          setShowCheckingOverlay(true);
        }, authCheckOverlayDelayMs);

    void checkAccess(controller.signal).finally(() => {
      if (overlayTimer) {
        window.clearTimeout(overlayTimer);
      }
    });

    return () => {
      if (overlayTimer) {
        window.clearTimeout(overlayTimer);
      }
      controller.abort();
    };
  }, [bypass]);

  const title = useMemo(() => {
    if (state === "setup") {
      return "Set owner password";
    }
    return "Owner sign in";
  }, [state]);

  async function checkAccess(signal?: AbortSignal) {
    setState("checking");
    try {
      const [bootstrapResponse, meResponse] = await Promise.all([
        fetch(`${apiBase}/settings/bootstrap`, { credentials: "include", signal }),
        fetch(`${apiBase}/auth/me`, { credentials: "include", signal })
      ]);
      const bootstrap = await bootstrapResponse.json() as BootstrapState;
      const me = await meResponse.json().catch(() => ({ authenticated: false }));
      if (signal?.aborted) {
        return;
      }
      if (!bootstrap.ownerConfigured) {
        writeOwnerAuthHint(false);
        setState("setup");
        return;
      }
      const authenticated = Boolean(me.authenticated);
      writeOwnerAuthHint(authenticated);
      setState(authenticated ? "authenticated" : "login");
    } catch {
      if (!signal?.aborted) {
        setMessage({ kind: "error", text: "Access check failed. Try signing in again." });
        setState("login");
      }
    }
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
    if (state === "setup") {
      const setupMessage =
        data.passwordNoteSaved === false
          ? "Owner password set, but the local password note could not be saved."
          : "Owner password set and saved to OWNER_PASSWORD.local.md";
      writeOwnerAuthHint(true);
      setMessage({ kind: data.passwordNoteSaved === false ? "error" : "success", text: setupMessage });
      window.setTimeout(() => setState("authenticated"), data.passwordNoteSaved === false ? 2400 : 900);
      return;
    }

    writeOwnerAuthHint(true);
    setMessage({ kind: "success", text: "Signed in" });
    setState("authenticated");
  }

  const accessGranted = state === "authenticated" || state === "bypass";
  const checkingAccess = state === "checking";
  const showAuthOverlay = !accessGranted && (!checkingAccess || showCheckingOverlay);
  const showAuthForm = !checkingAccess;

  return (
    <>
      <div className={showAuthOverlay ? "min-h-svh blur-lg pointer-events-none select-none" : ""}>
        {children}
      </div>
      {showAuthOverlay ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/82 p-4 backdrop-blur-xl">
          <Card className="w-full max-w-md">
            <CardHeader>
              {showAuthForm ? (
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <LockKeyhole aria-hidden="true" />
                </div>
              ) : null}
              <CardTitle>{checkingAccess ? "Checking access" : title}</CardTitle>
              <CardDescription>
                {checkingAccess
                  ? "Verifying owner session."
                  : state === "setup"
                    ? "Create the owner password for this deployment."
                    : "Use the owner password for this deployment."}
              </CardDescription>
            </CardHeader>
            {showAuthForm ? (
              <CardContent>
                <form className="flex flex-col gap-4" onSubmit={submit}>
                  <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="auth-password">
                    {state === "setup" ? "New password" : "Password"}
                    <Input
                      id="auth-password"
                      name="password"
                      type="password"
                      minLength={state === "setup" ? 12 : undefined}
                      autoFocus
                      required
                      className="h-11"
                    />
                  </label>
                  {message ? <MessageAlert kind={message.kind}>{message.text}</MessageAlert> : null}
                  <Button size="lg" type="submit">
                    {state === "setup" ? "Set password" : "Sign in"}
                  </Button>
                </form>
              </CardContent>
            ) : null}
          </Card>
        </div>
      ) : null}
    </>
  );
}

function readOwnerAuthHint(): boolean {
  try {
    return window.localStorage.getItem(ownerAuthHintKey) === "true";
  } catch {
    return false;
  }
}

function writeOwnerAuthHint(authenticated: boolean) {
  try {
    if (authenticated) {
      window.localStorage.setItem(ownerAuthHintKey, "true");
      return;
    }
    window.localStorage.removeItem(ownerAuthHintKey);
  } catch {
    // Ignore storage failures; the server-side session check remains authoritative.
  }
}
