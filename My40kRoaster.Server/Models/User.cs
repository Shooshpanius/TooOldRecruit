namespace My40kRoaster.Server.Models
{
    public class User
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string GoogleId { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Picture { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public List<Roster> Rosters { get; set; } = [];
    }
}
