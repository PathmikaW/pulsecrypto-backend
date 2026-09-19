# Running the backend on AWS EC2 (optional)

The backend runs fine on a laptop (`pnpm start`), and that is all a reviewer needs. This guide is for
hosting it on a small cloud VM so a mobile build can reach it without your laptop — for a demo
or a screen recording. It was used to host the submission on an AWS Free plan account.

This is an operations note, not an architecture decision. It uses only `deploy/aws-ec2-user-data.sh`
and the repository's `Dockerfile`; nothing in the application depends on AWS.

## What it costs, and why the data volume matters

- **AWS Free plan:** a new account gets $100 in credits for up to 6 months. AWS documents that the Free
  plan "won't incur any charges": when the credits or the six months run out, the account is **closed**
  (data is kept for 90 days) instead of billed. Do **not** click "Upgrade plan" — that is what makes
  overage billable.
- **The real cost driver is outbound data.** Measured against this backend with 8 pairs, one connected
  client receives **about 126 KB/s ≈ 0.46 GB per hour ≈ 11 GB per day**. AWS includes 100 GB/month of
  outbound transfer and then charges per GB from your credits. A 15-minute demo is roughly 100 MB;
  a phone left connected all month would be about 335 GB.
- **So:** keep the firewall closed to everyone but you, stop the instance when you are not using it, and
  keep the auto-stop and a billing budget alert as backups.

## What you need

- An AWS account and the AWS CLI v2 (`brew install awscli`).
- A dedicated IAM user (not root) with only the permissions below, and a CLI profile for it
  (`aws configure --profile pulsecrypto`, region `eu-north-1`). Keep the keys in `~/.aws/credentials`;
  delete the access key when you are finished.
- A billing budget (Billing → Budgets, e.g. $5 with email alerts) and Free Tier usage alerts, set up
  in the console by the account owner.

Least-privilege policy for the deployer user (EC2 in one region only, and it cannot launch anything
except a `t3.micro`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:TerminateInstances",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:DescribeImages",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVolumes",
        "ec2:DescribeTags",
        "ec2:CreateTags",
        "ec2:CreateSecurityGroup",
        "ec2:DeleteSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:GetConsoleOutput",
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "*",
      "Condition": { "StringEquals": { "aws:RequestedRegion": "eu-north-1" } }
    },
    {
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": { "StringNotEquals": { "ec2:InstanceType": "t3.micro" } }
    }
  ]
}
```

## Deploy

Use a region Binance serves. `eu-north-1` (Stockholm) worked; US regions are commonly blocked by Binance.

```bash
export AWS_PROFILE=pulsecrypto AWS_DEFAULT_REGION=eu-north-1 AWS_PAGER=""

# 1. Network and image (the default VPC is enough)
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNET=$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[0].SubnetId' --output text)
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
      --query 'Parameter.Value' --output text)

# 2. Firewall: TCP 3000 from your public IP only (no SSH port is opened)
MYIP=$(curl -s https://checkip.amazonaws.com)
SG=$(aws ec2 create-security-group --group-name pulsecrypto-backend-sg \
      --description "PulseCrypto backend, port 3000 from my IP" --vpc-id "$VPC" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 3000 --cidr "$MYIP/32"

# 3. Launch: t3.micro, 8 GiB disk, IMDSv2 required, stops (not deletes) when it powers itself off
IID=$(aws ec2 run-instances --image-id "$AMI" --instance-type t3.micro --subnet-id "$SUBNET" \
      --security-group-ids "$SG" --associate-public-ip-address \
      --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=8,VolumeType=gp3}' \
      --metadata-options HttpTokens=required --instance-initiated-shutdown-behavior stop \
      --user-data file://deploy/aws-ec2-user-data.sh \
      --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=pulsecrypto-backend}]' \
      --query 'Instances[0].InstanceId' --output text)

# 4. Wait, then read the public IP
aws ec2 wait instance-running --instance-ids "$IID"
IP=$(aws ec2 describe-instances --instance-ids "$IID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
```

The Docker build on first boot takes about two minutes. Follow it without SSH:

```bash
aws ec2 get-console-output --instance-id "$IID" --latest --output text | grep -E "PULSECRYPTO-SETUP-DONE|ERROR"
```

## Verify

```bash
curl http://$IP:3000/health          # {"status":"ok"}
curl http://$IP:3000/pairs/meta      # expect 8 pairs (5 required + 3 resolved)
```

Only 5 pairs means pair resolution fell back — usually Binance rejecting the region's IP range.

## Use it from the mobile app

In `pulsecrypto-mobile/.env` (gitignored):

```
EXPO_PUBLIC_API_BASE_URL=http://<ip>:3000
EXPO_PUBLIC_WS_BASE_URL=ws://<ip>:3000
```

Then restart Metro with `pnpm expo start --dev-client --clear`. This plaintext setup works for the
emulator and development builds only; a release build refuses non-`https`/`wss` URLs, so a
release build would need TLS in front of the server (not covered here).

## Day-to-day

- **Stop when you are done** (console: _Instance state → Stop instance_, or
  `aws ec2 stop-instances --instance-ids "$IID"`). A stopped instance has no compute or data charge.
- **Start again** with _Start instance_. The public IP **changes**, so update the mobile `.env`. The
  auto-stop timer is not re-armed by a manual start — stop it yourself.
- **Your IP changed** (new Wi-Fi, router restart)? The app will sit on "RECONNECTING…". Replace the rule:
  `aws ec2 revoke-security-group-ingress …` for the old address, then
  `aws ec2 authorize-security-group-ingress …` for the new one.
- **Finished for good:** `aws ec2 terminate-instances`, delete the security group, and delete the IAM
  access key.

## Limits of this setup

Plain HTTP/WS (no TLS), one instance, no monitoring beyond the `/metrics` endpoint, no automatic
redeploys — it is a demo host, not production infrastructure. The container image still contains the
builder's dev dependencies (see ADR-X4).
