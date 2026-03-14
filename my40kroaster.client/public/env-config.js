// Файл перезаписывается entrypoint.sh при запуске Docker-контейнера.
// В локальной разработке VITE_GOOGLE_CLIENT_ID берётся из .env через import.meta.env.
window._env_ = {
  VITE_GOOGLE_CLIENT_ID: ""
};
