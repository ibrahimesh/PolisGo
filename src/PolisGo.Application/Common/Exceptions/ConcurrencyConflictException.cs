namespace PolisGo.Application.Common.Exceptions;

// The caller acted on a version of the record that someone else has changed
// since they loaded it. A 409 like any conflict, but titled "Concurrent
// update" so a client can tell it apart, reload and keep the user's input.
public class ConcurrencyConflictException : ConflictException
{
    public const string DefaultMessage = "The record was modified by someone else — reload and retry.";

    public ConcurrencyConflictException() : base(DefaultMessage) { }
}
