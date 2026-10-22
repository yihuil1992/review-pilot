/** Never perform external business actions from a parallel trial deployment. */
export function assertExternalActionsAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.REVIEW_PILOT_TRIAL_MODE === "true") {
    throw new Error("External Google, Twilio and webhook requests are disabled in this trial environment");
  }
}

/** Allow an owner to refresh the existing Google grant without enabling business actions. */
export function assertGoogleOAuthSetupAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.REVIEW_PILOT_OAUTH_SETUP_ENABLED === "true") return;
  assertExternalActionsAllowed(env);
}
