import { SetMetadata } from "@nestjs/common";
import type { ApiScope } from "@review-pilot/shared";

export const apiScopesMetadataKey = "review-pilot:api-scopes";
export const RequireApiScopes = (...scopes: ApiScope[]) => SetMetadata(apiScopesMetadataKey, scopes);
