# My40kRoaster

Веб-приложение для создания и управления ростерами армий Warhammer 40,000 (10-я редакция).

## О проекте

**My40kRoaster** позволяет игрокам составлять армейские ростеры для игры в Warhammer 40,000 прямо в браузере — без установки дополнительного ПО. Приложение загружает актуальные данные об отрядах и фракциях из открытой базы данных [BSData](https://github.com/BSData) через прокси-API, предоставляемое сервисом [wh40kcards.ru](https://wh40kcards.ru).

### Ключевые возможности

- 📋 **Управление ростерами** — создание, редактирование и удаление ростеров с произвольными названиями и лимитом очков (500 / 1000 / 1500 / 2000 / 2500).
- 🪖 **Добавление отрядов** — выбор фракции, просмотр доступных юнитов, настройка количества моделей и снаряжения с автоматическим подсчётом стоимости в очках.
- ⚙️ **Сложные правила набора** — поддержка составных отрядов с несколькими независимыми контейнерами моделей, ограничений «1 на N моделей», минимально-максимальных размеров отрядов, полос стоимости (`costBands`) и прочих механик BSData.
- 🔐 **Авторизация через Google** — вход по учётной записи Google; ростеры привязаны к аккаунту пользователя и недоступны другим.
- 📱 **PWA** — приложение можно установить на устройство как Progressive Web App.
- 🐳 **Docker-деплой** — готовый `docker-compose.yml` для развёртывания в одну команду.

## Архитектура

```
My40kRoaster/
├── My40kRoaster.Server/   # Backend: ASP.NET Core Web API (.NET 9)
│   ├── Controllers/       # REST API: Auth, Rosters, BSData-прокси
│   ├── Data/              # AppDbContext (Entity Framework Core)
│   ├── Models/            # Сущности БД (User, Roster)
│   ├── DTOs/              # Data Transfer Objects
│   └── Dockerfile
├── my40kroaster.client/   # Frontend: React 19 + TypeScript + Vite
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

## Локальный запуск (разработка)

### Требования

- [.NET 9 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/)
- [MySQL 8.4](https://dev.mysql.com/) (или Docker)

### Шаги

1. Запустить MySQL (или воспользоваться Docker Compose только для БД):

   ```bash
   docker compose up db -d
   ```

2. Запустить бэкенд:

   ```bash
   cd My40kRoaster.Server
   dotnet run
   ```

   Сервер поднимется на `https://localhost:7xxx` / `http://localhost:5022`.

3. Запустить фронтенд:

   ```bash
   cd my40kroaster.client
   npm install
   npm run dev
   ```

   Приложение откроется на `http://localhost:53358`.

## Развёртывание через Docker Compose

Для запуска всего стека в production:

```bash
# Задать секретный ключ JWT
export JWT_KEY="ваш-надёжный-секретный-ключ-32-символа"

docker compose up -d --build
```

Приложение будет доступно на `http://localhost:8080`.

> **Важно:** в production обязательно задайте переменную окружения `JWT_KEY`.  
> Переменные `Google__ClientId` и `Google__ClientSecret` нужны для корректной верификации Google-токенов.

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