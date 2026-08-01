#!/usr/bin/env bash
set -euo pipefail

repository_url="https://github.com/krushiraj/bms-bot.git"
pinned_commit="63e78ca0cbbf4c9bf21819ade4d4f43ab0085dfe"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_path="${FLOW_BMS_INSTALL_PATH:-${repository_root}/.flow/integrations/bms-bot}"

mkdir -p "$(dirname "${target_path}")"
if [[ -e "${target_path}" ]]; then
  if [[ ! -d "${target_path}/.git" ]]; then
    echo "Refusing to overwrite non-Git path: ${target_path}" >&2
    exit 1
  fi
  actual_remote="$(git -C "${target_path}" remote get-url origin)"
  if [[ "${actual_remote}" != "${repository_url}" ]]; then
    echo "Unexpected origin at ${target_path}: ${actual_remote}" >&2
    exit 1
  fi
  if [[ -n "$(git -C "${target_path}" status --porcelain)" ]]; then
    echo "Refusing to update a modified integration checkout: ${target_path}" >&2
    exit 1
  fi
  git -C "${target_path}" fetch --depth 1 origin "${pinned_commit}"
else
  git clone --filter=blob:none --no-checkout "${repository_url}" "${target_path}"
  git -C "${target_path}" fetch --depth 1 origin "${pinned_commit}"
fi

git -C "${target_path}" checkout --detach "${pinned_commit}"
if [[ "$(git -C "${target_path}" rev-parse HEAD)" != "${pinned_commit}" ]]; then
  echo "Pinned BMS Bot revision verification failed" >&2
  exit 1
fi

if [[ -f "${target_path}/yarn.lock" ]]; then
  npx --yes yarn@1.22.22 --cwd "${target_path}" install --frozen-lockfile --non-interactive
elif [[ -f "${target_path}/package-lock.json" ]]; then
  npm --prefix "${target_path}" ci
else
  npm --prefix "${target_path}" install --no-package-lock
fi

echo "BMS Bot ready at ${target_path}"
echo "Set FLOW_BMS_BOT_PATH=${target_path}"
