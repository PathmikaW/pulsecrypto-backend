#!/bin/bash
# Boot script for running the PulseCrypto backend on an AWS EC2 instance
# (Amazon Linux 2023, x86-64, t3.micro). Pass it as EC2 user data; it runs once, as root, on first boot.
# See docs/deployment-aws-ec2.md.

BRANCH="release/v1.0.0"       # branch or tag to deploy
AUTO_STOP_MINUTES=360         # cost guard: the instance powers itself off (it stops, it is not deleted) after this long
MAX_CONNECTIONS_PER_IP=2      # each connected client receives about 126 KB/s, so keep these low on a public address
MAX_TOTAL_CONNECTIONS=10

# Optional HTTPS/WSS. Leave DOMAIN empty for plain HTTP/WS on port 3000 (development builds only).
# With a DuckDNS hostname, Caddy obtains a free Let's Encrypt certificate and proxies to the backend on 80/443.
DOMAIN=""                     # e.g. pulsecrypto.duckdns.org
DUCKDNS_SUBDOMAIN=""          # e.g. pulsecrypto
DUCKDNS_TOKEN=""              # secret: inject at launch (see the guide), never commit it

shutdown -h +"$AUTO_STOP_MINUTES"

# Log to a file and to the instance console, so progress can be read with `aws ec2 get-console-output`.
exec > >(tee /var/log/pulsecrypto-setup.log | logger -t user-data -s 2>/dev/console) 2>&1
set -x

# 1 GB of RAM is not enough for `pnpm install` + `tsc` inside the Docker build without swap.
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile

dnf install -y docker git
systemctl enable --now docker

git clone https://github.com/PathmikaW/pulsecrypto-backend.git /opt/pulsecrypto
cd /opt/pulsecrypto && git checkout "$BRANCH"
docker build -t pulsecrypto-backend .

if [ -z "$DOMAIN" ]; then
  docker run -d --name pulsecrypto --restart unless-stopped -p 3000:3000 \
    -e NODE_ENV=production -e MAX_CONNECTIONS_PER_IP="$MAX_CONNECTIONS_PER_IP" \
    -e MAX_TOTAL_CONNECTIONS="$MAX_TOTAL_CONNECTIONS" pulsecrypto-backend
else
  # The backend is only reachable through Caddy on the private Docker network, so it can trust the
  # X-Forwarded-For header Caddy sets (per-IP limits then apply to the real client address).
  docker network create pulsecrypto-net
  docker run -d --name pulsecrypto --network pulsecrypto-net --restart unless-stopped \
    -e NODE_ENV=production -e TRUST_PROXY=true -e MAX_CONNECTIONS_PER_IP="$MAX_CONNECTIONS_PER_IP" \
    -e MAX_TOTAL_CONNECTIONS="$MAX_TOTAL_CONNECTIONS" pulsecrypto-backend

  # Point the DuckDNS name at this instance on every boot (the public IP changes when it is stopped and started).
  # Tracing is switched off around the token so it never reaches the boot log.
  set +x
  umask 077
  printf 'DUCKDNS_SUBDOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "$DUCKDNS_SUBDOMAIN" "$DUCKDNS_TOKEN" > /etc/duckdns.env
  umask 022
  set -x
  cat > /usr/local/bin/duckdns-update.sh <<'SCRIPT'
#!/bin/bash
. /etc/duckdns.env
curl -s "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip="
SCRIPT
  chmod 755 /usr/local/bin/duckdns-update.sh
  cat > /etc/systemd/system/duckdns-update.service <<'UNIT'
[Unit]
Description=Update the DuckDNS record for this instance
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/duckdns-update.sh

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable --now duckdns-update.service
  echo "DuckDNS update result: $(/usr/local/bin/duckdns-update.sh)"

  mkdir -p /opt/caddy
  printf '%s {\n\treverse_proxy pulsecrypto:3000\n}\n' "$DOMAIN" > /opt/caddy/Caddyfile
  docker run -d --name caddy --network pulsecrypto-net --restart unless-stopped \
    -p 80:80 -p 443:443 -v /opt/caddy/Caddyfile:/etc/caddy/Caddyfile:ro -v caddy_data:/data caddy:2
fi

echo "PULSECRYPTO-SETUP-DONE"
