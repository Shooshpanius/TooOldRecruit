using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using My40kRoster.Server.Data;
using My40kRoster.Server.DTOs;
using My40kRoster.Server.Models;
using System.Security.Claims;
using System.Text.Json;

namespace My40kRoster.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class RostersController(AppDbContext db) : ControllerBase
    {
        private static readonly int[] AllowedPointsLimits = [500, 1000, 1500, 2000, 2500];
        private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

        private const string UnalignedForcesId = "581a-46b9-5b86-44b7";

        private static bool HasLegendsUnits(string unitsJson, string? factionId = null)
        {
            try
            {
                if (factionId == UnalignedForcesId)
                {
                    var factionDoc = JsonDocument.Parse(unitsJson);
                    foreach (var group in factionDoc.RootElement.EnumerateArray())
                    {
                        if (group.TryGetProperty("units", out var unitsEl) && unitsEl.GetArrayLength() > 0)
                            return true;
                    }
                    return false;
                }

                var doc = JsonDocument.Parse(unitsJson);
                foreach (var group in doc.RootElement.EnumerateArray())
                {
                    if (group.TryGetProperty("units", out var units))
                    {
                        foreach (var unit in units.EnumerateArray())
                        {
                            if (unit.TryGetProperty("name", out var name) &&
                                name.GetString()?.Contains("[Legends]", StringComparison.OrdinalIgnoreCase) == true)
                                return true;
                        }
                    }
                }
            }
            catch { }
            return false;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<RosterDto>>> GetRosters()
        {
            var userId = GetUserId();
            var rosters = await db.Rosters
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.UpdatedAt)
                .Select(r => new RosterDto
                {
                    Id = r.Id,
                    Name = r.Name,
                    FactionId = r.FactionId,
                    FactionName = r.FactionName,
                    PointsLimit = r.PointsLimit,
                    AllowLegends = r.AllowLegends,
                    DetachmentName = r.DetachmentName,
                    CreatedAt = r.CreatedAt,
                    UpdatedAt = r.UpdatedAt
                })
                .ToListAsync();
            return Ok(rosters);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<RosterDto>> GetRoster(string id)
        {
            var userId = GetUserId();
            var roster = await db.Rosters.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
            if (roster == null) return NotFound();
            return Ok(new RosterDto
            {
                Id = roster.Id,
                Name = roster.Name,
                FactionId = roster.FactionId,
                FactionName = roster.FactionName,
                PointsLimit = roster.PointsLimit,
                AllowLegends = roster.AllowLegends,
                DetachmentName = roster.DetachmentName,
                CreatedAt = roster.CreatedAt,
                UpdatedAt = roster.UpdatedAt
            });
        }

        [HttpPost]
        public async Task<ActionResult<RosterDto>> CreateRoster([FromBody] CreateRosterRequest request)
        {
            if (!AllowedPointsLimits.Contains(request.PointsLimit))
                return BadRequest($"Лимит очков должен быть одним из: {string.Join(", ", AllowedPointsLimits)}");
            var userId = GetUserId();
            var roster = new Roster
            {
                UserId = userId,
                Name = request.Name,
                FactionId = request.FactionId,
                FactionName = request.FactionName,
                PointsLimit = request.PointsLimit,
                AllowLegends = request.AllowLegends,
                DetachmentName = string.IsNullOrWhiteSpace(request.DetachmentName) ? null : request.DetachmentName.Trim()
            };
            db.Rosters.Add(roster);
            await db.SaveChangesAsync();
            var dto = new RosterDto
            {
                Id = roster.Id,
                Name = roster.Name,
                FactionId = roster.FactionId,
                FactionName = roster.FactionName,
                PointsLimit = roster.PointsLimit,
                AllowLegends = roster.AllowLegends,
                DetachmentName = roster.DetachmentName,
                CreatedAt = roster.CreatedAt,
                UpdatedAt = roster.UpdatedAt
            };
            return CreatedAtAction(nameof(GetRoster), new { id = roster.Id }, dto);
        }

        [HttpPut("{id}")]
        public async Task<ActionResult<RosterDto>> UpdateRoster(string id, [FromBody] UpdateRosterRequest request)
        {
            if (!AllowedPointsLimits.Contains(request.PointsLimit))
                return BadRequest($"Лимит очков должен быть одним из: {string.Join(", ", AllowedPointsLimits)}");
            var userId = GetUserId();
            var roster = await db.Rosters.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
            if (roster == null) return NotFound();
            if (!request.AllowLegends && HasLegendsUnits(roster.UnitsJson, roster.FactionId))
                return BadRequest("Нельзя отключить опцию [LEG]: в ростере есть отряды с [Legends].");
            roster.Name = request.Name;
            roster.PointsLimit = request.PointsLimit;
            roster.AllowLegends = request.AllowLegends;
            roster.DetachmentName = string.IsNullOrWhiteSpace(request.DetachmentName) ? null : request.DetachmentName.Trim();
            roster.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Ok(new RosterDto
            {
                Id = roster.Id,
                Name = roster.Name,
                FactionId = roster.FactionId,
                FactionName = roster.FactionName,
                PointsLimit = roster.PointsLimit,
                AllowLegends = roster.AllowLegends,
                DetachmentName = roster.DetachmentName,
                CreatedAt = roster.CreatedAt,
                UpdatedAt = roster.UpdatedAt
            });
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteRoster(string id)
        {
            var userId = GetUserId();
            var roster = await db.Rosters.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
            if (roster == null) return NotFound();
            db.Rosters.Remove(roster);
            await db.SaveChangesAsync();
            return NoContent();
        }

        [HttpGet("{id}/units")]
        public async Task<IActionResult> GetRosterUnits(string id)
        {
            var userId = GetUserId();
            var roster = await db.Rosters.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
            if (roster == null) return NotFound();
            return Content(roster.UnitsJson, "application/json");
        }

        [HttpPut("{id}/units")]
        public async Task<IActionResult> UpdateRosterUnits(string id, [FromBody] System.Text.Json.JsonElement units)
        {
            var userId = GetUserId();
            var roster = await db.Rosters.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
            if (roster == null) return NotFound();
            roster.UnitsJson = units.GetRawText();
            roster.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return NoContent();
        }
    }
}
