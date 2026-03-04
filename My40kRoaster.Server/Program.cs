using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using My40kRoaster.Server.Data;
using My40kRoaster.Server.Services;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=rosters.db"));

// JWT Authentication
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrEmpty(jwtKey))
{
    if (builder.Environment.IsProduction())
        throw new InvalidOperationException("Jwt:Key configuration is required in production.");
    jwtKey = "default-secret-key-for-dev-32chars!!";
}
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "My40kRoaster",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "My40kRoaster",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddScoped<BsDataImportService>();

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

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    // Add UnitsJson column for existing databases (idempotent)
    try
    {
        db.Database.ExecuteSqlRaw("ALTER TABLE Rosters ADD COLUMN UnitsJson TEXT NOT NULL DEFAULT '[]'");
    }
    catch (Microsoft.Data.Sqlite.SqliteException ex) when (ex.Message.Contains("duplicate column name"))
    {
        // Column already exists, no action needed
    }
    try
    {
        db.Database.ExecuteSqlRaw("ALTER TABLE Rosters ADD COLUMN AllowLegends INTEGER NOT NULL DEFAULT 0");
    }
    catch (Microsoft.Data.Sqlite.SqliteException ex) when (ex.Message.Contains("duplicate column name"))
    {
        // Column already exists, no action needed
    }
    // Ensure BsDataUnits and BsDataCostTiers tables exist for existing databases
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS BsDataUnits (
            Id TEXT NOT NULL PRIMARY KEY,
            FactionId TEXT NOT NULL,
            Name TEXT NOT NULL,
            Category TEXT NOT NULL,
            Cost INTEGER NULL,
            IsLeader INTEGER NOT NULL DEFAULT 0,
            MaxInRoster INTEGER NULL
        )
        """);
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS BsDataCostTiers (
            Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            UnitId TEXT NOT NULL,
            MinModels INTEGER NOT NULL,
            MaxModels INTEGER NOT NULL,
            Points INTEGER NOT NULL,
            FOREIGN KEY (UnitId) REFERENCES BsDataUnits(Id) ON DELETE CASCADE
        )
        """);
    // Schema migration tracking table
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS SchemaMigrations (
            Name TEXT NOT NULL PRIMARY KEY
        )
        """);
    // v2: Wipe all cached unit data so every faction is re-imported using the new
    // FetchAndApplyCostTiersAsync logic which fetches per-unit cost tiers from the
    // dedicated /units/{id}/cost-tiers endpoint.  Without this, factions cached
    // before this feature was added (e.g. Death Guard) would keep serving
    // Poxwalkers without any cost-tier data.
    // INSERT OR IGNORE returns 1 the very first time (migration not yet applied)
    // and 0 on every subsequent restart (already applied → no-op).
    var v2IsNew = db.Database.ExecuteSqlRaw(
        "INSERT OR IGNORE INTO SchemaMigrations (Name) VALUES ('v2_per_unit_cost_tiers')") > 0;
    if (v2IsNew)
    {
        db.Database.ExecuteSqlRaw("DELETE FROM BsDataCostTiers");
        db.Database.ExecuteSqlRaw("DELETE FROM BsDataUnits");
    }
}

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
