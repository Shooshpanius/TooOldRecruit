#!/bin/sh
# Генерируем конфигурацию времени выполнения из переменных окружения
# Это позволяет передавать VITE_GOOGLE_CLIENT_ID через docker-compose без пересборки образа
ESCAPED_ID=$(printf '%s' "${VITE_GOOGLE_CLIENT_ID:-}" | sed 's/\\/\\\\/g; s/"/\\"/g')
cat > /usr/share/nginx/html/env-config.js << EOF
window._env_ = {
  VITE_GOOGLE_CLIENT_ID: "${ESCAPED_ID}"
};
EOF
exec nginx -g "daemon off;"
