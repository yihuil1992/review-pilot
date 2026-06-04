import { publicAsset } from "@/lib/demo-mode";

export function LogoMark() {
  return <img src={publicAsset("/brand/review-pilot-logo.png")} alt="" aria-hidden="true" />;
}
