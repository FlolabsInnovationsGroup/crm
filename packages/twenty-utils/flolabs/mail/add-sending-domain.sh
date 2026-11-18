#!/usr/bin/env bash
# Command-line twin of the CRM page Settings > Sending domains, for when the CRM is down.
#   ./add-sending-domain.sh news.example.com            add it and print its DNS records
#   ./add-sending-domain.sh --records news.example.com  print the records again
#   ./add-sending-domain.sh --check news.example.com    check what DNS publishes now
set -euo pipefail
cd "$(dirname "$0")"

env_value() { grep -E "^$1=" .env | cut -d= -f2- || true; }
SELECTOR=$(env_value DKIM_SELECTOR); SELECTOR=${SELECTOR:-lm1}
SENDING_IPV4=$(env_value SENDING_IPV4)
SENDING_IPV6=$(env_value SENDING_IPV6)

mode=add
case "${1:-}" in --records) mode=records; shift ;; --check) mode=check; shift ;; esac
DOMAIN=$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')
if [[ ! "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]; then
  echo "Usage: $0 [--records|--check] news.example.com" >&2
  exit 2
fi
DKIM_FILE="domains/$DOMAIN.dkim"
SPF="v=spf1 ip4:$SENDING_IPV4${SENDING_IPV6:+ ip6:$SENDING_IPV6} -all"

print_records() {
  echo
  echo "Add these TXT records at the DNS provider of $DOMAIN:"
  echo "  $DOMAIN                      $SPF"
  echo "  $SELECTOR._domainkey.$DOMAIN    $(cat "$DKIM_FILE")"
  echo "  _dmarc.$DOMAIN               v=DMARC1; p=none"
  echo
  echo "If $DOMAIN already has a v=spf1 record, add 'ip4:$SENDING_IPV4' to it instead of a second one."
}

check_records() {
  command -v dig > /dev/null || { echo "dig is missing: apt install bind9-dnsutils" >&2; exit 1; }
  local spf dkim dmarc
  spf=$(dig +short TXT "$DOMAIN" @1.1.1.1 | tr -d '"' | grep '^v=spf1' || true)
  dkim=$(dig +short TXT "$SELECTOR._domainkey.$DOMAIN" @1.1.1.1 | tr -d '" \n' || true)
  dmarc=$(dig +short TXT "_dmarc.$DOMAIN" @1.1.1.1 | tr -d '"' || true)
  [[ " $spf " == *" ip4:$SENDING_IPV4 "* ]] && echo "SPF   OK" || echo "SPF   missing"
  [ "$dkim" = "$(tr -d ' ' < "$DKIM_FILE")" ] && echo "DKIM  OK" || echo "DKIM  missing or different"
  [[ "$dmarc" == v=DMARC1* ]] && echo "DMARC OK" || echo "DMARC missing"
}

if [ "$mode" != add ]; then
  [ -f "$DKIM_FILE" ] || { echo "$DOMAIN has no key yet" >&2; exit 1; }
  if [ "$mode" = records ]; then print_records; else check_records; fi
  exit 0
fi

grep -qxF "$DOMAIN" domains/domains.txt || echo "$DOMAIN" >> domains/domains.txt
echo "Waiting for dkim-manager to create the key..."
for _ in $(seq 1 30); do
  [ -f "$DKIM_FILE" ] && break
  sleep 2
done
[ -f "$DKIM_FILE" ] || { echo "No key yet, check: docker compose logs dkim-manager" >&2; exit 1; }
print_records
echo
echo "Then wait a few minutes and run: $0 --check $DOMAIN"
