using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using My40kRoaster.Server.Data;
using My40kRoaster.Server.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace My40kRoaster.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController(AppDbContext db, IConfiguration config) : ControllerBase
    {
        [HttpPost("google")]
        public async Task<IActionResult> GoogleLogin([FromBody] GoogleLoginRequest request)
        {
            // Verify Google ID token
            using var httpClient = new HttpClient();
            var response = await httpClient.GetAsync(
                $"https://oauth2.googleapis.com/tokeninfo?id_token={request.IdToken}");

            if (!response.IsSuccessStatusCode)
                return Unauthorized("Invalid Google token");

            var payload = await response.Content.ReadFromJsonAsync<GoogleTokenPayload>();
            if (payload == null)
                return Unauthorized("Invalid token payload");

            var clientId = config["Google:ClientId"];
            if (!string.IsNullOrEmpty(clientId) && payload.Aud != clientId)
                return Unauthorized("Token audience mismatch");

            var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleId == payload.Sub);
            if (user == null)
            {
                user = new User
                {
                    GoogleId = payload.Sub,
                    Email = payload.Email,
                    Name = payload.Name,
                    Picture = payload.Picture
                };
                db.Users.Add(user);
                await db.SaveChangesAsync();
            }

            var token = GenerateJwtToken(user);
            return Ok(new { token, user = new { user.Id, user.Email, user.Name, user.Picture } });
        }

        private string GenerateJwtToken(User user)
        {
            var jwtKey = config["Jwt:Key"] ?? "default-secret-key-for-dev-32chars!!";
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name, user.Name)
            };
            var token = new JwtSecurityToken(
                issuer: config["Jwt:Issuer"] ?? "My40kRoaster",
                audience: config["Jwt:Audience"] ?? "My40kRoaster",
                claims: claims,
                expires: DateTime.UtcNow.AddDays(30),
                signingCredentials: creds
            );
            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    public class GoogleLoginRequest
    {
        public string IdToken { get; set; } = string.Empty;
    }

    public class GoogleTokenPayload
    {
        [System.Text.Json.Serialization.JsonPropertyName("sub")]
        public string Sub { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
        [System.Text.Json.Serialization.JsonPropertyName("picture")]
        public string? Picture { get; set; }
        [System.Text.Json.Serialization.JsonPropertyName("aud")]
        public string Aud { get; set; } = string.Empty;
    }
}
