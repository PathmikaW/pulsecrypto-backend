#!/bin/bash
# Boot script for running the PulseCrypto backend on an AWS EC2 instance
# (Amazon Linux 2023, x86-64, t3.micro). Pass it as EC2 user data; it runs once, as root, on first boot.
# See docs/deployment-aws-ec2.md.

BRANCH="release/v1.0.0"       # branch or tag to deploy
AUTO_STOP_MINUTES=360         # cost guard: the instance powers itself off (it stops, it is not deleted) after this long
MAX_CONNECTIONS_PER_IP=2      # each connected client receives about 126 KB/s, so keep this low on a public address

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
docker run -d --name pulsecrypto --restart unless-stopped -p 3000:3000 \
  -e NODE_ENV=production -e MAX_CONNECTIONS_PER_IP="$MAX_CONNECTIONS_PER_IP" pulsecrypto-backend

echo "PULSECRYPTO-SETUP-DONE"
