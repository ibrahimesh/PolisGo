namespace PolisGo.Application.Common.Exceptions;

// A request body over an endpoint's own cap: a 413, not an error to track.
public class PayloadTooLargeException(string message) : Exception(message);
