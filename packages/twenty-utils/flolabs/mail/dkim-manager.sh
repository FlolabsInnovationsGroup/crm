#!/usr/bin/env bash
# Keeps a DKIM key per sending domain (SENDING_DOMAINS plus /domains/domains.txt, written by
# the CRM) and rspamd's signing maps in step; publishes <domain>.dkim and server.json for the CRM.
# A removed domain stops being signed but keeps its key, so re-adding it reuses its DNS record.
set -uo pipefail
umask 077

DKIM_DIR=${DKIM_DIR:-/var/lib/rspamd/dkim}
SHARED_DIR=${SHARED_DIR:-/domains}
SELECTOR=${DKIM_SELECTOR:-lm1}
INTERVAL=${DKIM_MANAGER_INTERVAL:-10}
CRM_UID=${CRM_UID:-1000}
DOMAIN_PATTERN='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'

# mktemp never follows a file someone else planted, unlike a fixed .tmp name.
write_if_changed() {
  local target=$1 content=$2 temporary
  temporary=$(mktemp "$target.XXXXXX") || return 1
  printf '%s' "$content" > "$temporary"
  chmod 644 "$temporary"
  if cmp -s "$temporary" "$target"; then
    rm -f "$temporary"
  else
    mv -f "$temporary" "$target"
  fi
}

list_domains() {
  {
    tr ' ' '\n' <<< "${SENDING_DOMAINS:-}"
    cat "$SHARED_DIR/domains.txt" 2> /dev/null
  } | tr 'A-Z' 'a-z' | tr -d ' \r\t' | grep -E "$DOMAIN_PATTERN" | sort -u
}

json_string_array() {
  local first=1
  printf '['
  for item in "$@"; do
    [ "$first" = 1 ] || printf ','
    printf '"%s"' "$item"
    first=0
  done
  printf ']'
}

sync_once() {
  local owner domain key txt selectors="" paths="" fixed
  owner=$(stat -c '%u:%g' "$DKIM_DIR")

  for domain in $(list_domains); do
    key="$DKIM_DIR/$domain.$SELECTOR.key"
    txt="$DKIM_DIR/$domain.$SELECTOR.txt"
    if [ ! -f "$key" ]; then
      if rspamadm dkim_keygen -b 2048 -s "$SELECTOR" -d "$domain" -k "$key.new" > "$txt.new"; then
        chmod 400 "$key.new"
        chmod 644 "$txt.new"
        chown -h "$owner" "$key.new" "$txt.new"
        mv "$txt.new" "$txt"
        mv "$key.new" "$key"
        echo "dkim-manager: created key for $domain"
      else
        echo "dkim-manager: could not create a key for $domain" >&2
        rm -f "$key.new" "$txt.new"
        continue
      fi
    fi
    write_if_changed "$SHARED_DIR/$domain.dkim" "$(grep -o '"[^"]*"' "$txt" | tr -d '"\n')"
    selectors+="$domain $SELECTOR"$'\n'
    paths+="$domain $key"$'\n'
  done

  write_if_changed "$DKIM_DIR/flolabs-selectors.map" "$selectors"
  write_if_changed "$DKIM_DIR/flolabs-paths.map" "$paths"

  # shellcheck disable=SC2086
  fixed=$(json_string_array $(tr ' ' '\n' <<< "${SENDING_DOMAINS:-}" | tr 'A-Z' 'a-z' | grep -E "$DOMAIN_PATTERN"))
  write_if_changed "$SHARED_DIR/server.json" \
    "{\"selector\":\"$SELECTOR\",\"ipv4\":\"${SENDING_IPV4:-}\",\"ipv6\":\"${SENDING_IPV6:-}\",\"fixedDomains\":$fixed}"
}

mkdir -p "$SHARED_DIR"
[ -e "$SHARED_DIR/domains.txt" ] || install -m 644 /dev/null "$SHARED_DIR/domains.txt"
chown -h "$CRM_UID" "$SHARED_DIR" "$SHARED_DIR/domains.txt"
chmod 755 "$SHARED_DIR"

if [ "${1:-}" = "--once" ]; then
  sync_once
  exit 0
fi

echo "dkim-manager: watching $SHARED_DIR/domains.txt every ${INTERVAL}s"
while true; do
  sync_once
  sleep "$INTERVAL"
done
