using Microsoft.EntityFrameworkCore;
using My40kRoaster.Server.Models;

namespace My40kRoaster.Server.Data
{
    public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
    {
        public DbSet<User> Users { get; set; }
        public DbSet<Roster> Rosters { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>()
                .HasIndex(u => u.GoogleId)
                .IsUnique();
            
            modelBuilder.Entity<Roster>()
                .HasOne(r => r.User)
                .WithMany(u => u.Rosters)
                .HasForeignKey(r => r.UserId);
        }
    }
}
