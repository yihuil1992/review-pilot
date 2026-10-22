#!/bin/sh
set -eu

# Coolify removes .git before custom builds. Never source its credentials file.
metadata=/artifacts/build-time.env
revision=$(sed -n 's/^SOURCE_COMMIT=//p' "$metadata" | tr -d "\"'")
case "$revision" in
  *[!0-9a-f]*|'') echo 'Invalid source commit; enable Include source commit in build.' >&2; exit 1 ;;
esac
[ "${#revision}" -eq 40 ] || { echo 'Expected a full source commit.' >&2; exit 1; }
image_tag=$(sed -n 's/^REVIEW_PILOT_IMAGE_TAG=//p' "$metadata" | tr -d "\"'")
image_tag=${image_tag:-coolify-trial}
case "$image_tag" in
  *[!a-zA-Z0-9_.-]*) echo 'Invalid trial image tag.' >&2; exit 1 ;;
esac

builder=review-pilot-coolify
container=buildx_buildkit_review-pilot-coolify0
if ! docker buildx inspect "$builder" >/dev/null 2>&1; then
  docker buildx create --name "$builder" --driver docker-container \
    --driver-opt image=moby/buildkit:v0.34.1,memory=2g,memory-swap=2g,cpu-period=100000,cpu-quota=200000 \
    --buildkitd-config deploy/buildkitd.toml
fi
docker buildx inspect "$builder" --bootstrap

# Fail before building if the dedicated builder has lost its resource boundary.
limits=$(docker inspect "$container" --format '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.CpuPeriod}} {{.HostConfig.CpuQuota}}')
[ "$limits" = '2147483648 2147483648 100000 200000' ] || {
  echo 'Unexpected builder resource limits; repair the dedicated builder.' >&2
  exit 1
}
free_kib=$(docker exec "$container" df -Pk /var/lib/buildkit | awk 'END {print $4}')
[ "$free_kib" -ge 4194304 ] || { echo 'Less than 4 GiB free on build storage.' >&2; exit 1; }

# All four application services share this image. Build it once inside Coolify.
docker buildx build --builder "$builder" --platform linux/arm64 --load \
  --progress plain --provenance=false \
  --build-arg SOURCE_REVISION="$revision" \
  --build-arg API_PROXY_URL=http://api:4000 \
  --build-arg REVIEW_PILOT_TRIAL_MODE=true \
  -t "review-pilot:$revision" -t "review-pilot:$image_tag" .
REVIEW_PILOT_IMAGE_TAG="$image_tag" sh scripts/verify-trial-image.sh
