using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PolicyHistoryAndPricing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Policies_CustomerId",
                table: "Policies");

            migrationBuilder.DropIndex(
                name: "IX_Payments_PolicyId",
                table: "Payments");

            migrationBuilder.AddColumn<decimal>(
                name: "Pricing_BaseRate",
                table: "Policies",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Pricing_BonusMalusFactor",
                table: "Policies",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Pricing_DriverAgeFactor",
                table: "Policies",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Pricing_EngineFactor",
                table: "Policies",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Pricing_ExperienceFactor",
                table: "Policies",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Pricing_TermFactor",
                table: "Policies",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Pricing_TotalFactor",
                table: "Policies",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Pricing_VehicleAgeFactor",
                table: "Policies",
                type: "decimal(9,4)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Reference",
                table: "Payments",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PolicyStatusHistory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PolicyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromStatus = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: true),
                    ToStatus = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ChangedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ChangedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PolicyStatusHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PolicyStatusHistory_Policies_PolicyId",
                        column: x => x.PolicyId,
                        principalTable: "Policies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PolicyStatusHistory_Users_ChangedByUserId",
                        column: x => x.ChangedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Policies_CustomerId_StartDate",
                table: "Policies",
                columns: new[] { "CustomerId", "StartDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Policies_CustomerId_Status_EndDate",
                table: "Policies",
                columns: new[] { "CustomerId", "Status", "EndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Payments_PolicyId_PaidAt",
                table: "Payments",
                columns: new[] { "PolicyId", "PaidAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PolicyStatusHistory_ChangedAt",
                table: "PolicyStatusHistory",
                column: "ChangedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PolicyStatusHistory_ChangedByUserId",
                table: "PolicyStatusHistory",
                column: "ChangedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PolicyStatusHistory_PolicyId_ChangedAt",
                table: "PolicyStatusHistory",
                columns: new[] { "PolicyId", "ChangedAt" });

            // Backfill what the data can prove: every policy was issued at
            // CreatedAt, and paid ones became Active at their first completed
            // payment. Cancellation times were never stored, so those rows are
            // not invented; the actor is unknown (null) for all of them.
            migrationBuilder.Sql("""
                INSERT INTO PolicyStatusHistory (Id, PolicyId, FromStatus, ToStatus, ChangedByUserId, ChangedAt)
                SELECT NEWID(), p.Id, NULL, 'Draft', NULL, p.CreatedAt
                FROM Policies p;

                INSERT INTO PolicyStatusHistory (Id, PolicyId, FromStatus, ToStatus, ChangedByUserId, ChangedAt)
                SELECT NEWID(), pay.PolicyId, 'Draft', 'Active', NULL, MIN(pay.PaidAt)
                FROM Payments pay
                WHERE pay.Status = 'Completed'
                GROUP BY pay.PolicyId;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PolicyStatusHistory");

            migrationBuilder.DropIndex(
                name: "IX_Policies_CustomerId_StartDate",
                table: "Policies");

            migrationBuilder.DropIndex(
                name: "IX_Policies_CustomerId_Status_EndDate",
                table: "Policies");

            migrationBuilder.DropIndex(
                name: "IX_Payments_PolicyId_PaidAt",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "Pricing_BaseRate",
                table: "Policies");

            migrationBuilder.DropColumn(
                name: "Pricing_BonusMalusFactor",
                table: "Policies");

            migrationBuilder.DropColumn(
                name: "Pricing_DriverAgeFactor",
                table: "Policies");

            migrationBuilder.DropColumn(
                name: "Pricing_EngineFactor",
                table: "Policies");

            migrationBuilder.DropColumn(
                name: "Pricing_ExperienceFactor",
                table: "Policies");

            migrationBuilder.DropColumn(
                name: "Pricing_TermFactor",
                table: "Policies");

            migrationBuilder.DropColumn(
                name: "Pricing_TotalFactor",
                table: "Policies");

            migrationBuilder.DropColumn(
                name: "Pricing_VehicleAgeFactor",
                table: "Policies");

            migrationBuilder.DropColumn(
                name: "Reference",
                table: "Payments");

            migrationBuilder.CreateIndex(
                name: "IX_Policies_CustomerId",
                table: "Policies",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_PolicyId",
                table: "Payments",
                column: "PolicyId");
        }
    }
}
