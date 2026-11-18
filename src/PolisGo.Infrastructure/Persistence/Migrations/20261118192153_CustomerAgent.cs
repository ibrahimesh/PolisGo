using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CustomerAgent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AgentId",
                table: "Customers",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Customers_AgentId",
                table: "Customers",
                column: "AgentId");

            migrationBuilder.AddForeignKey(
                name: "FK_Customers_Users_AgentId",
                table: "Customers",
                column: "AgentId",
                principalTable: "Users",
                principalColumn: "Id");

            // Existing books: a customer an agent has sold to goes to the
            // agent who sold most recently, so no agent loses sight of a
            // customer they already serve. (Migrations run on SQL Server only.)
            migrationBuilder.Sql("""
                UPDATE c SET AgentId = latest.AgentId
                FROM Customers c
                CROSS APPLY (
                    SELECT TOP 1 p.AgentId FROM Policies p
                    WHERE p.CustomerId = c.Id AND p.AgentId IS NOT NULL
                    ORDER BY p.CreatedAt DESC
                ) latest;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Customers_Users_AgentId",
                table: "Customers");

            migrationBuilder.DropIndex(
                name: "IX_Customers_AgentId",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "AgentId",
                table: "Customers");
        }
    }
}
