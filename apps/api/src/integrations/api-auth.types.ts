import type { ApiClientEnvironment, ApiScope } from "@review-pilot/shared";
import type { Request } from "express";

export type ApiPrincipal = {
  clientId: string;
  credentialId: string;
  credentialPrefix: string;
  environment: ApiClientEnvironment;
  scopes: ApiScope[];
  allLocations: boolean;
  locationIds: string[];
};

export type ExternalApiRequest = Request & {
  apiPrincipal?: ApiPrincipal;
  requestId?: string;
};
