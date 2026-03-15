using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using My40kRoster.Server.Data;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Database
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrEmpty(connectionString))
{
    if (builder.Environment.IsProduction())
        throw new InvalidOperationException("ConnectionStrings:DefaultConnection is required in production.");
    connectionString = "Server=localhost;Port=3306;Database=rosters;User=rosters_user;Password=rosters_pass;";
}
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseMySql(connectionString, ServerVersion.AutoDetect(connectionString)));

// JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrEmpty(jwtKey))
{
    if (builder.Environment.IsProduction())
        throw new InvalidOperationException("Jwt:Key configuration is required in production.");
    jwtKey = "default-secret-key-for-dev-32chars!!";
    // Записываем разрешённый ключ обратно в конфигурацию, чтобы контроллеры
    // читали тот же ключ через IConfiguration["Jwt:Key"] без дублирования логики fallback.
    builder.Configuration["Jwt:Key"] = jwtKey;
}
// Нормализация Google:ClientId — поддержка переменной окружения GOOGLE_CLIENT_ID
// (используется как в docker-compose, так и в прямых деплоях)
var googleClientId = builder.Configuration["Google:ClientId"];
if (string.IsNullOrEmpty(googleClientId))
{
    googleClientId = builder.Configuration["GOOGLE_CLIENT_ID"];
    if (!string.IsNullOrEmpty(googleClientId))
        builder.Configuration["Google:ClientId"] = googleClientId;
}
if (string.IsNullOrEmpty(googleClientId) && builder.Environment.IsProduction())
    throw new InvalidOperationException("Google:ClientId (или переменная окружения GOOGLE_CLIENT_ID) обязательна в production.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "My40kRoster",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "My40kRoster",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddOpenApi();

// CORS for development
builder.Services.AddCors(options =>
{
    options.AddPolicy("DevCors", policy =>
    {
        policy.WithOrigins("http://localhost:53358", "http://localhost:5022")
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// HttpClient for external API proxy
builder.Services.AddHttpClient("wh40kapi", client =>
{
    client.BaseAddress = new Uri("https://api.wh40kcards.ru/api/bsdata/");
});

var app = builder.Build();

// Создаём схему БД при первом запуске и применяем недостающие столбцы
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var schemaLogger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("SchemaUpgrade");
    db.Database.EnsureCreated();

    // EnsureCreated не обновляет существующую схему — добавляем недостающие столбцы вручную.
    // Проект использует MySQL; ошибка «Duplicate column name» означает, что столбец уже есть — это ожидаемо.
    void TryAddColumn(string sql)
    {
        try { db.Database.ExecuteSqlRaw(sql); }
        catch (Exception ex)
        {
            // Логируем предупреждение, но не прерываем запуск: «Duplicate column» — штатная ситуация,
            // остальные ошибки также не должны блокировать старт при уже корректной схеме.
            schemaLogger.LogWarning("Миграция столбца не выполнена (возможно, уже существует): {Message}", ex.Message);
        }
    }

    TryAddColumn("ALTER TABLE `Rosters` ADD COLUMN `UnitsJson` LONGTEXT NOT NULL DEFAULT '[]'");
    TryAddColumn("ALTER TABLE `Rosters` ADD COLUMN `AllowLegends` TINYINT(1) NOT NULL DEFAULT 0");
    TryAddColumn("ALTER TABLE `Rosters` ADD COLUMN `DetachmentName` TEXT NULL");
}

// Разрешаем unload-события: отказываемся от Chrome-трейла по устареванию unload,
// чтобы браузер не блокировал обработчики unload и не выводил [Violation] в консоль.
app.Use(async (context, next) =>
{
    // Заголовок нужно выставить до вызова next(), пока ответ ещё не отправлен.
    context.Response.Headers.Append("Permissions-Policy", "unload=*");
    await next(context);
});

app.UseDefaultFiles();
app.MapStaticAssets();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors("DevCors");
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapFallbackToFile("/index.html");

app.Run();
