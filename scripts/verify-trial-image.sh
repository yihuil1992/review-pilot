#!/bin/sh
# Coolify removes .git and writes its build metadata to this dotenv file.
set -eu
revision=${SOURCE_COMMIT:-}
if [ -r /artifacts/build-time.env ]; then
  # Read only the revision; never source/evaluate a file containing credentials.
  revision=$(sed -n 's/^SOURCE_COMMIT=//p' /artifacts/build-time.env | tr -d "\"'")
fi
case "$revision" in
  *[!0-9a-f]*|'') echo 'Invalid source commit; refusing imported image.' >&2; exit 1 ;;
esac
[ "${#revision}" -eq 40 ] || { echo 'Expected a full source commit.' >&2; exit 1; }
image="review-pilot:${REVIEW_PILOT_IMAGE_TAG:-coolify-trial}"
actual=$(docker image inspect "$image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
[ "$actual" = "$revision" ] || { echo 'Imported image does not match source commit.' >&2; exit 1; }
platform=$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')
[ "$platform" = 'linux/arm64' ] || { echo 'Expected a Linux ARM64 image.' >&2; exit 1; }
runtime=$(docker run --rm --network none --entrypoint node "$image" --version)
[ "$runtime" = 'v24.22.1' ] || { echo 'Expected Node 24.22.1 in imported image.' >&2; exit 1; }
printf 'Verified imported trial image for %s\n' "$revision"
