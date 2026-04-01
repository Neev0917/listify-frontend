using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using WebApplication3.Models;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// 1. CORS - must be registered first
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// 2. JWT Authentication
var supabaseUrl = Environment.GetEnvironmentVariable("Supabase__Url")
    ?? builder.Configuration["Supabase__Url"]
    ?? builder.Configuration["Supabase:Url"];

Console.WriteLine($"Supabase URL: {supabaseUrl}");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = supabaseUrl + "/auth/v1";
        options.MetadataAddress = supabaseUrl + "/auth/v1/.well-known/openid-configuration";
        options.RequireHttpsMetadata = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(60)
        };

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine("AUTH FAILED: " + context.Exception.Message);
                return Task.CompletedTask;
            },
            OnTokenValidated = context =>
            {
                Console.WriteLine("TOKEN VALID: " + context.Principal?.FindFirst("sub")?.Value);
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers();

// 3. Database
var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
Console.WriteLine($"Database URL found: {!string.IsNullOrEmpty(databaseUrl)}");

if (!string.IsNullOrEmpty(databaseUrl))
{
    try
    {
        var uri = new Uri(databaseUrl);
        var userInfo = uri.UserInfo.Split(':');
        var npgsqlBuilder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = userInfo[0],
            Password = userInfo.Length > 1 ? userInfo[1] : "",
            SslMode = SslMode.Require,
            TrustServerCertificate = true
        };

        Console.WriteLine($"Connecting to PostgreSQL at {uri.Host}");
        builder.Services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(npgsqlBuilder.ConnectionString));
    }
    catch (Exception ex)
    {
        Console.WriteLine($"DB config error: {ex.Message}");
        builder.Services.AddDbContext<AppDbContext>(options =>
            options.UseSqlite("Data Source=todo.db"));
    }
}
else
{
    Console.WriteLine("Using SQLite");
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseSqlite("Data Source=todo.db"));
}

var app = builder.Build();

// Auto-create tables
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.EnsureCreated();
        Console.WriteLine("Database ready!");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database error: {ex.Message}");
    }
}

app.UseStaticFiles();
app.UseRouting();

// CORS must come before Authentication
app.UseCors("AllowAll");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
