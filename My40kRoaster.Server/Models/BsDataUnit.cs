namespace My40kRoaster.Server.Models
{
    public class BsDataUnit
    {
        public string Id { get; set; } = string.Empty;
        public string FactionId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public int? Cost { get; set; }
        public bool IsLeader { get; set; }
        public int? MaxInRoster { get; set; }
        public ICollection<BsDataCostTier> CostTiers { get; set; } = new List<BsDataCostTier>();
    }
}
