using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PolicyRowVersionAndSinglePayment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RowVersion",
                table: "Policies",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            // A policy is paid once. A database that already holds two
            // completed payments for one policy (the race this fixes) must be
            // cleaned up first, or this index fails to build.
            migrationBuilder.CreateIndex(
                name: "IX_Payments_PolicyId_Completed",
                table: "Payments",
                column: "PolicyId",
                unique: true,
                filter: "[Status] = 'Completed'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Payments_PolicyId_Completed",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "Policies");
        }
    }
}
