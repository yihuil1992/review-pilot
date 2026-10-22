/** Never perform external business actions from a parallel trial deployment. */
export function assertExternalActionsAllowed(env: Record<string, string | undefined> = process.env): void {
  if (env.REVIEW_PILOT_TRIAL_MODE === "true") {
    throw new Error("External Google, Twilio and webhook requests are disabled in this trial environment");
  }
}
