using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ErrorSearchKey : Migration
    {
        /// <inheritdoc />
        // Groups saved before this have no key; SearchKeyBackfillService fills
        // them in after startup (the fold is .NET code, not SQL).
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SearchKey",
                table: "ErrorGroups",
                type: "nvarchar(700)",
                maxLength: 700,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SearchKey",
                table: "ErrorGroups");
        }
    }
}
