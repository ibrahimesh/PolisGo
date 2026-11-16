using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ClaimRowVersionPortable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // SQL Server cannot ALTER a timestamp/rowversion column; drop and
            // recreate as plain varbinary(max) so RowVersion becomes a portable
            // client-managed concurrency token.
            migrationBuilder.DropColumn(name: "RowVersion", table: "Claims");

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "Claims",
                type: "varbinary(max)",
                nullable: false,
                defaultValue: new byte[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "RowVersion", table: "Claims");

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "Claims",
                type: "rowversion",
                rowVersion: true,
                nullable: false);
        }
    }
}
