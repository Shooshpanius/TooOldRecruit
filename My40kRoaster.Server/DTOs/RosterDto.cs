namespace My40kRoaster.Server.DTOs
{
    public class RosterDto
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string FactionId { get; set; } = string.Empty;
        public string FactionName { get; set; } = string.Empty;
        public int PointsLimit { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class CreateRosterRequest
    {
        public string Name { get; set; } = string.Empty;
        public string FactionId { get; set; } = string.Empty;
        public string FactionName { get; set; } = string.Empty;
        public int PointsLimit { get; set; }
    }

    public class UpdateRosterRequest
    {
        public string Name { get; set; } = string.Empty;
        public int PointsLimit { get; set; }
    }
}
