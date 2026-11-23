#!/bin/sh
# Pile Supabase locale réduite (base, Auth, PostgREST, passerelle, boîte mail) pour tenir dans 3 Go.
# Le SMTP de la boîte mail n'est pas publié sur l'hôte : un relais minimal l'expose sur 54425 (local seulement).
set -eu
projet=code-tank-site
relais=supabase_smtp_relay_$projet

case "${1:-}" in
  start)
    supabase start -x studio,realtime,imgproxy,edge-runtime,logflare,vector,postgres-meta,supavisor,storage-api
    docker rm -f "$relais" >/dev/null 2>&1 || true
    # L'image vector (déjà tirée par la CLI) fournit le nc de BusyBox.
    image=$(docker inspect "supabase_inbucket_$projet" --format '{{.Config.Image}}' | sed 's#/mailpit:.*#/vector:0.58.0-alpine#')
    docker run -d --rm --name "$relais" --network "supabase_network_$projet" -p 127.0.0.1:54425:1025 \
      --entrypoint sh "$image" -c "nc -lk -p 1025 -e nc supabase_inbucket_$projet 1025" >/dev/null
    ;;
  stop)
    docker rm -f "$relais" >/dev/null 2>&1 || true
    supabase stop
    ;;
  *) echo "usage : stack.sh start|stop" >&2; exit 2 ;;
esac
