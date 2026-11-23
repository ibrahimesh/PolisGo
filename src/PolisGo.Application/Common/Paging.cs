namespace PolisGo.Application.Common;

public static class Paging
{
    // Rows to skip for a 1-based page. (page - 1) * pageSize in int overflows
    // for a huge page into a negative OFFSET, which SQL Server rejects (a 500)
    // and SQLite accepts; in long and capped, a page past the end is empty.
    public static int Skip(int page, int pageSize) =>
        (int)Math.Min(((long)Math.Max(page, 1) - 1) * pageSize, int.MaxValue);
}
