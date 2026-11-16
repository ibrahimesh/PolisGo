namespace PolisGo.Application.Common.Exceptions;

public class ValidationException : Exception
{
    // Keyed by field name so clients can show inline errors next to inputs.
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    public ValidationException(string field, string error)
        : base("One or more validation errors occurred.")
    {
        Errors = new Dictionary<string, string[]>
        {
            [field] = new[] { error }
        };
    }

    public ValidationException(IDictionary<string, string[]> errors)
        : base("One or more validation errors occurred.")
    {
        Errors = new Dictionary<string, string[]>(errors);
    }
}
