using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PolisGo.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ErrorTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ErrorGroups",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Fingerprint = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    ExceptionType = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Endpoint = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    FirstSeenAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastSeenAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    OccurrenceCount = table.Column<long>(type: "bigint", nullable: false),
                    LastHttpStatus = table.Column<int>(type: "int", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    IsRegressed = table.Column<bool>(type: "bit", nullable: false),
                    RegressedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ResolvedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ResolvedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RowVersion = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ErrorGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ErrorGroups_Users_ResolvedByUserId",
                        column: x => x.ResolvedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ErrorHourlyCounts",
                columns: table => new
                {
                    HourStartUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Count = table.Column<long>(type: "bigint", nullable: false),
                    ServerErrorCount = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ErrorHourlyCounts", x => new { x.HourStartUtc, x.Source });
                });

            migrationBuilder.CreateTable(
                name: "ErrorOccurrences",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ErrorGroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    TraceId = table.Column<string>(type: "varchar(32)", unicode: false, maxLength: 32, nullable: false),
                    ReferenceCode = table.Column<string>(type: "varchar(8)", unicode: false, maxLength: 8, nullable: false),
                    HttpStatus = table.Column<int>(type: "int", nullable: true),
                    HttpMethod = table.Column<string>(type: "varchar(10)", unicode: false, maxLength: 10, nullable: true),
                    RouteTemplate = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    ActorRole = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    ActorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AppVersion = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Environment = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Message = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    StackTrace = table.Column<string>(type: "nvarchar(max)", maxLength: 8000, nullable: true),
                    UserAgentFamily = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    ClientRoute = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ErrorOccurrences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ErrorOccurrences_ErrorGroups_ErrorGroupId",
                        column: x => x.ErrorGroupId,
                        principalTable: "ErrorGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ErrorGroups_Fingerprint",
                table: "ErrorGroups",
                column: "Fingerprint",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ErrorGroups_LastSeenAt",
                table: "ErrorGroups",
                column: "LastSeenAt");

            migrationBuilder.CreateIndex(
                name: "IX_ErrorGroups_ResolvedByUserId",
                table: "ErrorGroups",
                column: "ResolvedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ErrorGroups_Status_IsRegressed",
                table: "ErrorGroups",
                columns: new[] { "Status", "IsRegressed" });

            migrationBuilder.CreateIndex(
                name: "IX_ErrorOccurrences_ErrorGroupId_OccurredAt",
                table: "ErrorOccurrences",
                columns: new[] { "ErrorGroupId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ErrorOccurrences_OccurredAt",
                table: "ErrorOccurrences",
                column: "OccurredAt");

            migrationBuilder.CreateIndex(
                name: "IX_ErrorOccurrences_ReferenceCode",
                table: "ErrorOccurrences",
                column: "ReferenceCode");

            migrationBuilder.CreateIndex(
                name: "IX_ErrorOccurrences_TraceId",
                table: "ErrorOccurrences",
                column: "TraceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ErrorHourlyCounts");

            migrationBuilder.DropTable(
                name: "ErrorOccurrences");

            migrationBuilder.DropTable(
                name: "ErrorGroups");
        }
    }
}
