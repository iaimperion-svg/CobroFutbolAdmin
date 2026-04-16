#!/bin/sh
set -eu

runtime="${APP_RUNTIME:-web}"

case "$runtime" in
  web)
    exec npm run start:web
    ;;
  worker)
    exec npm run start:worker
    ;;
  *)
    echo "APP_RUNTIME must be 'web' or 'worker'. Received: $runtime" >&2
    exit 1
    ;;
esac
