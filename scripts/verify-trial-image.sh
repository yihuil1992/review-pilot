#!/bin/sh
# Coolify removes .git before this step; its helper must receive SOURCE_COMMIT.
set -eu
revision=${SOURCE_COMMIT:?Enable Include source commit in build in Coolify}
case "$revision" in
  *[!0-9a-f]*|'') echo 'Invalid source commit; refusing imported image.' >&2; exit 1 ;;
esac
[ "${#revision}" -eq 40 ] || { echo 'Expected a full source commit.' >&2; exit 1; }
image="review-pilot:${REVIEW_PILOT_IMAGE_TAG:-coolify-trial}"
actual=$(docker image inspect "$image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
[ "$actual" = "$revision" ] || { echo 'Imported image does not match source commit.' >&2; exit 1; }
platform=$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')
[ "$platform" = 'linux/arm64' ] || { echo 'Expected a Linux ARM64 image.' >&2; exit 1; }
printf 'Verified imported trial image for %s\n' "$revision"
