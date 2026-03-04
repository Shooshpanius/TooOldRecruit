namespace My40kRoaster.Server.Models
{
    public class BsDataCostTier
    {
        public int Id { get; set; }
        public string UnitId { get; set; } = string.Empty;
        public BsDataUnit? Unit { get; set; }
        public int MinModels { get; set; }
        public int MaxModels { get; set; }
        public int Points { get; set; }
    }
}
