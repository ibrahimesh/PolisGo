namespace PolisGo.Infrastructure.Storage;

public class FileStorageOptions
{
    public const string SectionName = "FileStorage";

    // Absolute or app-relative directory sitting OUTSIDE wwwroot so uploaded
    // files are never statically served by the host.
    public string RootPath { get; set; } = "App_Data/claim-documents";
}
