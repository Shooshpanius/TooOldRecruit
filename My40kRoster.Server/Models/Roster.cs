namespace My40kRoster.Server.Models
{
    public class Roster
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string UserId { get; set; } = string.Empty;
        public User? User { get; set; }
        public string Name { get; set; } = string.Empty;
        public string FactionId { get; set; } = string.Empty;
        public string FactionName { get; set; } = string.Empty;
        public int PointsLimit { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string UnitsJson { get; set; } = "[]";
        public bool AllowLegends { get; set; } = false;
        // Название детачмента армии (необязательное поле)
        public string? DetachmentName { get; set; }
    }
}
