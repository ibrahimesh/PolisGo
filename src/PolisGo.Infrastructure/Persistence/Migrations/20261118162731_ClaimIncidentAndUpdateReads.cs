using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ClaimIncidentAndUpdateReads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ClaimStatusHistory_ClaimId",
                table: "ClaimStatusHistory");

            migrationBuilder.AddColumn<string>(
                name: "IncidentType",
                table: "Claims",
                type: "nvarchar(24)",
                maxLength: 24,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "Claims",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ClaimUpdateReads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClaimId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClaimUpdateReads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ClaimUpdateReads_Claims_ClaimId",
                        column: x => x.ClaimId,
                        principalTable: "Claims",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ClaimUpdateReads_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ClaimStatusHistory_ClaimId_ChangedAt",
                table: "ClaimStatusHistory",
                columns: new[] { "ClaimId", "ChangedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Claims_IncidentDate",
                table: "Claims",
                column: "IncidentDate");

            migrationBuilder.CreateIndex(
                name: "IX_ClaimUpdateReads_ClaimId_UserId",
                table: "ClaimUpdateReads",
                columns: new[] { "ClaimId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ClaimUpdateReads_UserId",
                table: "ClaimUpdateReads",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ClaimUpdateReads");

            migrationBuilder.DropIndex(
                name: "IX_ClaimStatusHistory_ClaimId_ChangedAt",
                table: "ClaimStatusHistory");

            migrationBuilder.DropIndex(
                name: "IX_Claims_IncidentDate",
                table: "Claims");

            migrationBuilder.DropColumn(
                name: "IncidentType",
                table: "Claims");

            migrationBuilder.DropColumn(
                name: "Location",
                table: "Claims");

            migrationBuilder.CreateIndex(
                name: "IX_ClaimStatusHistory_ClaimId",
                table: "ClaimStatusHistory",
                column: "ClaimId");
        }
    }
}
