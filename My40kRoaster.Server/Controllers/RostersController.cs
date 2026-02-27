using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using My40kRoaster.Server.Data;
using My40kRoaster.Server.DTOs;
using My40kRoaster.Server.Models;
using System.Security.Claims;

namespace My40kRoaster.Server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class RostersController(AppDbContext db) : ControllerBase
    {
        private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

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
                CreatedAt = roster.CreatedAt,
                UpdatedAt = roster.UpdatedAt
            });
        }

        [HttpPost]
        public async Task<ActionResult<RosterDto>> CreateRoster([FromBody] CreateRosterRequest request)
        {
            var userId = GetUserId();
            var roster = new Roster
            {
                UserId = userId,
                Name = request.Name,
                FactionId = request.FactionId,
                FactionName = request.FactionName,
                PointsLimit = request.PointsLimit
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
                CreatedAt = roster.CreatedAt,
                UpdatedAt = roster.UpdatedAt
            };
            return CreatedAtAction(nameof(GetRoster), new { id = roster.Id }, dto);
        }

        [HttpPut("{id}")]
        public async Task<ActionResult<RosterDto>> UpdateRoster(string id, [FromBody] UpdateRosterRequest request)
        {
            var userId = GetUserId();
            var roster = await db.Rosters.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
            if (roster == null) return NotFound();
            roster.Name = request.Name;
            roster.PointsLimit = request.PointsLimit;
            roster.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Ok(new RosterDto
            {
                Id = roster.Id,
                Name = roster.Name,
                FactionId = roster.FactionId,
                FactionName = roster.FactionName,
                PointsLimit = roster.PointsLimit,
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
    }
}
