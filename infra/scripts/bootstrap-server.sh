#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "请在新服务器上使用 root 执行。" >&2
  exit 1
fi

DEPLOY_USER=${DEPLOY_USER:-rankdeploy}
ADMIN_CIDR=${ADMIN_CIDR:-}
if [[ -z ${ADMIN_CIDR} ]]; then
  SSH_CLIENT_VALUE=${SSH_CLIENT:-}
  ADMIN_IP=${SSH_CLIENT_VALUE%% *}
  if [[ -z ${ADMIN_IP} ]]; then echo "无法识别当前 SSH 管理 IP，请手动设置 ADMIN_CIDR。" >&2; exit 1; fi
  if [[ ${ADMIN_IP} == *:* ]]; then ADMIN_CIDR="${ADMIN_IP}/128"; else ADMIN_CIDR="${ADMIN_IP}/32"; fi
fi

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 curl ca-certificates openssl rsync sudo
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y dnf-plugins-core curl ca-certificates openssl rsync sudo
  if ! dnf -q list --available docker-ce >/dev/null 2>&1 && ! rpm -q docker-ce >/dev/null 2>&1; then
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
  fi
  dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "仅支持 apt 或 dnf 系发行版。" >&2
  exit 1
fi
systemctl enable --now docker

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  if command -v adduser >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "${DEPLOY_USER}"
  else
    useradd --create-home --shell /bin/bash "${DEPLOY_USER}"
  fi
fi
if getent group sudo >/dev/null 2>&1; then
  usermod -aG docker,sudo "${DEPLOY_USER}"
elif getent group wheel >/dev/null 2>&1; then
  usermod -aG docker,wheel "${DEPLOY_USER}"
else
  usermod -aG docker "${DEPLOY_USER}"
fi
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
if [[ -f /root/.ssh/authorized_keys && ! -s /home/${DEPLOY_USER}/.ssh/authorized_keys ]]; then
  install -m 600 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
fi
install -d -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" /opt/rank-monitor /opt/rank-monitor/backups

SWAP_TOTAL_BYTES=$(free -b | awk '/^Swap:/ {print $2}')
if (( SWAP_TOTAL_BYTES < 2147483648 )) && [[ ! -f /swapfile-rank-monitor ]]; then
  SWAP_EXTRA_BYTES=$((2147483648 - SWAP_TOTAL_BYTES))
  fallocate -l "${SWAP_EXTRA_BYTES}" /swapfile-rank-monitor
  chmod 600 /swapfile-rank-monitor
  mkswap /swapfile-rank-monitor
  swapon /swapfile-rank-monitor
  echo '/swapfile-rank-monitor none swap sw 0 0' >> /etc/fstab
fi
sysctl vm.swappiness=10
if ! grep -q '^vm.swappiness=10$' /etc/sysctl.conf; then echo 'vm.swappiness=10' >> /etc/sysctl.conf; fi

if [[ ${APPLY_HOST_FIREWALL:-no} == "yes" ]]; then
  if command -v ufw >/dev/null 2>&1; then
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow from "${ADMIN_CIDR}" to any port 22 proto tcp comment 'restricted SSH'
    ufw allow 80/tcp comment 'HTTP for TLS issuance'
    ufw allow 443/tcp comment 'HTTPS'
    ufw allow 443/udp comment 'HTTP3'
    ufw --force enable
  elif command -v firewall-cmd >/dev/null 2>&1; then
    systemctl enable --now firewalld
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=${ADMIN_CIDR} port port=22 protocol=tcp accept"
    firewall-cmd --reload
  else
    echo "未找到受支持的主机防火墙工具，跳过。" >&2
  fi
else
  echo "保留当前主机防火墙状态；请在云平台或主机防火墙中仅开放 80/443，并限制 22 来源。"
fi

echo "基础环境已完成。先用 ${DEPLOY_USER} 和 SSH 密钥新开一个终端验证登录，再运行 harden-ssh.sh。"
