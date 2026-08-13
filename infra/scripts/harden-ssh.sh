#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then echo "请使用 root 执行。" >&2; exit 1; fi
DEPLOY_USER=${DEPLOY_USER:-rankdeploy}
if [[ ${CONFIRM_DEPLOY_KEY_WORKS:-} != "yes" ]]; then
  echo "只有在另一个终端已确认 ${DEPLOY_USER} 密钥登录成功后，才可设置 CONFIRM_DEPLOY_KEY_WORKS=yes。" >&2
  exit 1
fi
if [[ ! -s /home/${DEPLOY_USER}/.ssh/authorized_keys ]]; then echo "部署用户没有 authorized_keys，拒绝修改 SSH。" >&2; exit 1; fi

install -d -m 755 /etc/ssh/sshd_config.d
printf '%s\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PermitRootLogin no' 'PubkeyAuthentication yes' > /etc/ssh/sshd_config.d/90-rank-monitor.conf
sshd -t
if systemctl list-unit-files sshd.service >/dev/null 2>&1; then
  systemctl reload sshd
else
  systemctl reload ssh
fi
echo "已关闭密码登录和 root 远程登录。当前 root 会话先不要关闭，再次验证 ${DEPLOY_USER} 登录。"
