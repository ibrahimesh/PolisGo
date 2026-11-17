using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AdminStatsIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Policies_CreatedAt",
                table: "Policies",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Policies_Status",
                table: "Policies",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_ClaimStatusHistory_ToStatus_ClaimId_ChangedAt",
                table: "ClaimStatusHistory",
                columns: new[] { "ToStatus", "ClaimId", "ChangedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Claims_CreatedAt",
                table: "Claims",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Claims_Status",
                table: "Claims",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Policies_CreatedAt",
                table: "Policies");

            migrationBuilder.DropIndex(
                name: "IX_Policies_Status",
                table: "Policies");

            migrationBuilder.DropIndex(
                name: "IX_ClaimStatusHistory_ToStatus_ClaimId_ChangedAt",
                table: "ClaimStatusHistory");

            migrationBuilder.DropIndex(
                name: "IX_Claims_CreatedAt",
                table: "Claims");

            migrationBuilder.DropIndex(
                name: "IX_Claims_Status",
                table: "Claims");
        }
    }
}
