import { afterEach, expect, it, vi } from "vitest";
import { GoogleService } from "./google.service.js";
import type { PrismaService } from "../prisma.service.js";
import type { CryptoService } from "../security/crypto.service.js";
import type { SettingsService } from "../settings/settings.service.js";
afterEach(() => {vi.unstubAllGlobals();vi.unstubAllEnvs();});
function setup(enabled: string) {
 vi.stubEnv("REVIEW_PILOT_TRIAL_MODE","true");vi.stubEnv("REVIEW_PILOT_OAUTH_SETUP_ENABLED",enabled);
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({access_token:"access",refresh_token:"refresh",expires_in:3600}))).mockResolvedValueOnce(new Response(JSON.stringify({sub:"test-user",email:"test@example.invalid"})));
 vi.stubGlobal("fetch",fetch);
 const p={appSetting:{findUnique:async()=>({value:{redirectUri:"https://reviews.shakingcrab.net/api/google/oauth/callback",expiresAt:new Date(Date.now()+60000).toISOString()}}),deleteMany:async()=>({count:1})},secretValue:{upsert:async()=>({id:"secret"})},googleAccount:{upsert:async()=>({id:"account",email:"test@example.invalid"}),findUnique:async()=>({accessTokenEncrypted:"access",tokenExpiresAt:new Date(Date.now()+3600000)})},review:{findUnique:async()=>({businessLocation:{googleAccountId:"account",googleAccountName:"accounts/1",googleLocationName:"locations/1"},googleReviewId:"review"})}};
 const s=new GoogleService(p as unknown as PrismaService,{encryptSecret:(s:string)=>s,decryptSecret:(s:string)=>s} as CryptoService,{getGoogleOAuthSettings:async()=>({clientId:"id",clientSecret:"secret"})} as SettingsService);return {s,fetch};
}
it("keeps OAuth exchange blocked unless setup was explicitly enabled",async()=>{const {s,fetch}=setup("false");await expect(s.completeOAuth("code","state")).rejects.toThrow("disabled in this trial");expect(fetch).not.toHaveBeenCalled();});
it("allows existing-grant setup but still blocks Google publication",async()=>{const {s,fetch}=setup("true");await expect(s.completeOAuth("code","state")).resolves.toMatchObject({accountId:"account"});expect(fetch.mock.calls.map(x=>x[0])).toEqual(["https://oauth2.googleapis.com/token","https://openidconnect.googleapis.com/v1/userinfo"]);fetch.mockClear();await expect(s.publishReply("review","fictional")).rejects.toThrow("disabled in this trial");expect(fetch).not.toHaveBeenCalled();});
