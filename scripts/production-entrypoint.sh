#!/bin/sh
set -eu

# Standby still allows local validation and explicitly enabled OAuth setup.
# Live producers must be stopped before setting this flag in Coolify.
case "${REVIEW_PILOT_PRODUCTION_ACTIVE:-false}" in
  false)
    export REVIEW_PILOT_TRIAL_MODE=true
    export REVIEW_SYNC_SCHEDULER_ENABLED=false
    export REVIEW_SYNC_AUTO_GENERATE_ENABLED=false
    export NOTIFICATION_SCHEDULER_ENABLED=false
    ;;
  true)
    export REVIEW_PILOT_TRIAL_MODE=false
    export REVIEW_SYNC_SCHEDULER_ENABLED="${REVIEW_SYNC_SCHEDULER_ENABLED:-true}"
    export REVIEW_SYNC_AUTO_GENERATE_ENABLED="${REVIEW_SYNC_AUTO_GENERATE_ENABLED:-true}"
    export NOTIFICATION_SCHEDULER_ENABLED="${NOTIFICATION_SCHEDULER_ENABLED:-false}"
    ;;
  *) echo 'REVIEW_PILOT_PRODUCTION_ACTIVE must be true or false.' >&2; exit 1 ;;
esac
export REVIEW_PILOT_ENV=live
exec "$@"
