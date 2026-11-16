using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ClaimRowVersionGuid : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // varbinary(max) -> uniqueidentifier is not a legal ALTER COLUMN cast;
            // drop and recreate instead.
            migrationBuilder.DropColumn(name: "RowVersion", table: "Claims");

            migrationBuilder.AddColumn<Guid>(
                name: "RowVersion",
                table: "Claims",
                type: "uniqueidentifier",
                nullable: false,
                defaultValueSql: "NEWID()");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "RowVersion", table: "Claims");

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "Claims",
                type: "varbinary(max)",
                nullable: false,
                defaultValue: new byte[0]);
        }
    }
}
