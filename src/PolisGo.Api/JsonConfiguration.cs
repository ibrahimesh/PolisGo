using System.Text.Json;
using System.Text.Json.Serialization;

namespace PolisGo.Api;

// Centralises JSON settings so Program.cs and tests apply the same rules.
public static class JsonConfiguration
{
    public static void Configure(JsonSerializerOptions options)
    {
        // Enums travel over the wire as their names ("Draft", "Active", ...) —
        // matches how they're stored in the database and reads well in curl.
        // allowIntegerValues:false means "role": 2 is rejected with a 400,
        // forcing clients to use the stable, discoverable name.
        // Enum names are parsed case-insensitively by default, so "adjuster"
        // and "Adjuster" both resolve to UserRole.Adjuster.
        options.Converters.Add(new JsonStringEnumConverter(
            namingPolicy: null,
            allowIntegerValues: false));

        // Match the ASP.NET Core defaults so a JsonSerializerOptions configured
        // via this helper behaves the same whether it's used by MVC or by a
        // standalone call (e.g. from tests).
        options.PropertyNameCaseInsensitive = true;
    }
}
