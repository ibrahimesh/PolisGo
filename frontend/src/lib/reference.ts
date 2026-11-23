// The server's traceId is a W3C traceparent ("00-<32 hex>-<16 hex>-00").
// People quote the first 8 characters of the trace id, upper-cased; support
// finds the request by that prefix. Anything else falls back to its own
// first 8 letters and digits.
export function shortReference(traceId: string): string {
  const w3c = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i.exec(traceId);
  const source = w3c?.[1] ?? traceId.replace(/[^0-9a-z]/gi, '');
  return source.slice(0, 8).toUpperCase();
}
