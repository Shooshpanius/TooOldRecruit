# my40kroaster.client

Фронтенд-часть приложения **My40kRoaster** — React 19 + TypeScript + Vite.

## Быстрый старт

```bash
npm install
npm run dev
```

Приложение откроется на `http://localhost:53358`.

## Команды

| Команда | Описание |
|---|---|
| `npm run dev` | Запуск dev-сервера с HMR |
| `npm run build` | Сборка для продакшна |
| `npm run lint` | Запуск ESLint |
| `npm run preview` | Предпросмотр production-сборки |

## Настройка окружения

Скопируйте `.env.example` в `.env` и укажите свой Google Client ID:

```bash
cp .env.example .env
```

## Структура

```
src/
├── pages/       # Страницы: Home, CreateRoster, RosterDetail
├── components/  # Компоненты: AddUnitModal и др.
├── services/    # api.ts — взаимодействие с сервером и BSData
├── contexts/    # AuthContext (текущий пользователь)
└── types/       # TypeScript-типы
```

Подробнее — в [основном README](../README.md).
