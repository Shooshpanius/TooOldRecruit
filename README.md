# Too Old Recruit

<div align="center">

[![Live](https://img.shields.io/badge/🚀%20Продакшн-wh40kcards.ru-darkred?style=for-the-badge&logo=google-chrome&logoColor=white)](https://wh40kcards.ru/)

[![GitHub Stars](https://img.shields.io/github/stars/Shooshpanius/TooOldRecruit?style=flat-square&logo=github&label=Stars)](https://github.com/Shooshpanius/TooOldRecruit/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Shooshpanius/TooOldRecruit?style=flat-square&logo=github&label=Forks)](https://github.com/Shooshpanius/TooOldRecruit/forks)
[![GitHub Issues](https://img.shields.io/github/issues/Shooshpanius/TooOldRecruit?style=flat-square&logo=github&label=Issues)](https://github.com/Shooshpanius/TooOldRecruit/issues)
[![License: GPL v3](https://img.shields.io/badge/License-GPL_v3-blue?style=flat-square)](LICENSE.txt)

![.NET](https://img.shields.io/badge/.NET_9-512BD4?style=flat-square&logo=dotnet&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=flat-square&logo=mysql&logoColor=white)

</div>

Веб-приложение для создания и управления ростерами армий Warhammer 40,000 (10-я редакция).

## О проекте

**Too Old Recruit** позволяет игрокам составлять армейские ростеры для игры в Warhammer 40,000 прямо в браузере — без установки дополнительного ПО. Приложение загружает актуальные данные об отрядах и фракциях из открытой базы данных [BSData](https://github.com/BSData) через прокси-API, предоставляемое сервисом [wh40kcards.ru](https://wh40kcards.ru).

> **🌐 Попробовать прямо сейчас:** [**wh40kcards.ru**](https://wh40kcards.ru/)

### Ключевые возможности

- 📋 **Управление ростерами** — создание, редактирование и удаление ростеров с произвольными названиями и лимитом очков (500 / 1000 / 1500 / 2000 / 2500).
- 🪖 **Добавление отрядов** — выбор фракции, просмотр доступных юнитов, настройка количества моделей и снаряжения с автоматическим подсчётом стоимости в очках.
- ⚙️ **Сложные правила набора** — поддержка составных отрядов с несколькими независимыми контейнерами моделей, ограничений «1 на N моделей», минимально-максимальных размеров отрядов, полос стоимости (`costBands`) и прочих механик BSData.
- 🔐 **Авторизация через Google** — вход по учётной записи Google; ростеры привязаны к аккаунту пользователя и недоступны другим.
- 📱 **PWA** — приложение можно установить на устройство как Progressive Web App.
- 🐳 **Docker-деплой** — готовый `docker-compose.yml` для развёртывания в одну команду.

## Архитектура

```
My40kRoster/
├── My40kRoster.Server/   # Backend: ASP.NET Core Web API (.NET 9)
│   ├── Controllers/       # REST API: Auth, Rosters, BSData-прокси
│   ├── Data/              # AppDbContext (Entity Framework Core)
│   ├── Models/            # Сущности БД (User, Roster)
│   ├── DTOs/              # Data Transfer Objects
│   └── Dockerfile
├── my40kroster.client/   # Frontend: React 19 + TypeScript + Vite
│   ├── src/
│   │   ├── pages/         # Страницы: Home, CreateRoster, RosterDetail
│   │   ├── components/    # Компоненты: AddUnitModal и др.
│   │   ├── services/      # api.ts — взаимодействие с сервером и BSData
│   │   ├── contexts/      # AuthContext (текущий пользователь)
│   │   └── types/         # TypeScript-типы
│   └── Dockerfile
└── docker-compose.yml     # MySQL + Server (prod)
```

### Backend

- **ASP.NET Core 9**, **Entity Framework Core** с **MySQL** (Pomelo).
- Три контроллера:
  - `AuthController` — вход через Google OAuth (верификация `id_token`, выдача JWT).
  - `RostersController` — CRUD ростеров пользователя (защищено JWT).
  - `BsdataController` — прокси к `api.wh40kcards.ru` для получения списков фракций, юнитов, дерева снаряжения.
- JWT-аутентификация; в production ключ задаётся через переменную окружения.

### Frontend

- **React 19** + **TypeScript** + **Vite**.
- Маршрутизация через **React Router v7**.
- Три основные страницы: главная (список ростеров), создание ростера, детальная страница ростера.
- Модальное окно `AddUnitModal` с полной логикой ограничений BSData.

## Настройка Google OAuth

Google Client ID нужен как фронтенду (для отображения кнопки входа), так и бэкенду (для верификации токена).

### Как получить Client ID

1. Откройте [Google Cloud Console](https://console.cloud.google.com/).
2. Создайте OAuth 2.0 Client ID типа **Web application**.
3. Добавьте в **Authorized JavaScript origins**: `http://localhost:53358` (для разработки).

### Для разработки

**Фронтенд** — скопируйте `.env.example` в `.env` и заполните значение:
```bash
cp my40kroster.client/.env.example my40kroster.client/.env
# Отредактируйте my40kroster.client/.env, вставив ваш Client ID
```

**Бэкенд** — скопируйте `appsettings.Development.json.example` в `appsettings.Development.json` и заполните:
```bash
cp My40kRoster.Server/appsettings.Development.json.example My40kRoster.Server/appsettings.Development.json
# Отредактируйте appsettings.Development.json, вставив ваш Client ID
```

Файлы `.env` и `appsettings.Development.json` добавлены в `.gitignore` и не попадут в репозиторий.

## Локальный запуск (разработка)

### Требования

- [.NET 9 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/)
- [MySQL 8.4](https://dev.mysql.com/) (или Docker)

### Шаги

1. Настроить Google OAuth (см. раздел выше).

2. Запустить MySQL (или воспользоваться Docker Compose только для БД):

   ```bash
   docker compose up db -d
   ```

3. Запустить бэкенд:

   ```bash
   cd My40kRoster.Server
   dotnet run
   ```

   Сервер поднимется на `https://localhost:7xxx` / `http://localhost:5022`.

4. Запустить фронтенд:

   ```bash
   cd my40kroster.client
   npm install
   npm run dev
   ```

   Приложение откроется на `http://localhost:53358`.

## Развёртывание через Docker Compose

Для запуска всего стека в production:

```bash
# Задать переменные окружения
export JWT_KEY="ваш-надёжный-секретный-ключ-32-символа"
export GOOGLE_CLIENT_ID="ваш-google-client-id.apps.googleusercontent.com"

docker compose up -d --build
```

Приложение будет доступно на `http://localhost:8080`.

> **Важно:** в production обязательно задайте переменные окружения `JWT_KEY` и `GOOGLE_CLIENT_ID`.  
> `GOOGLE_CLIENT_ID` используется сервером для верификации Google-токенов и передаётся фронтенду как `VITE_GOOGLE_CLIENT_ID` через docker-compose в runtime — пересборка образа не требуется.

## Технологии

| Слой | Технология |
|---|---|
| Backend | ASP.NET Core 9, C# |
| ORM | Entity Framework Core (Pomelo MySQL) |
| Auth | Google OAuth 2.0, JWT |
| Frontend | React 19, TypeScript, Vite |
| Routing | React Router v7 |
| PWA | vite-plugin-pwa, Workbox |
| Container | Docker, Docker Compose |
| Data | BSData / wh40kcards.ru API |

## Лицензия

Смотрите [LICENSE.txt](LICENSE.txt).