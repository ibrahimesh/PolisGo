using PolisGo.Application.Abstractions;
using PolisGo.Domain.Enums;

namespace PolisGo.Application.Claims;

public enum ClaimAction
{
    Review,
    Approve,
    Reject,
    Pay,
    Withdraw
}

// Why an action is unavailable, as a stable code the SPA translates. The
// entity's transitions enforce the same rules; this only explains them ahead.
public static class ClaimActionBlock
{
    public const string AlreadyInReview = "AlreadyInReview";
    public const string StartReviewFirst = "StartReviewFirst";
    public const string AssignedToAnother = "AssignedToAnother";
    public const string AlreadyDecided = "AlreadyDecided";
    public const string NotApproved = "NotApproved";
    public const string AlreadyPaid = "AlreadyPaid";
    public const string Withdrawn = "Withdrawn";
    public const string Closed = "Closed";
    // An agent reading a claim on a policy they sold, for a customer now in
    // another agent's book: only the current agent acts for them.
    public const string OutsideYourBook = "OutsideYourBook";
}

public record ClaimActionState(ClaimAction Action, bool Allowed, string? BlockedReason);

internal static class ClaimActions
{
    // Only the actions the caller's role may ever take are listed: staff get
    // the decision steps, the customer side (Client, Agent) gets withdraw.
    public static IReadOnlyList<ClaimActionState> For(
        ClaimStatus status, Guid? assignedAdjusterId, ICurrentUser user, bool writable = true)
    {
        var actions = new List<ClaimActionState>();
        if (user.Role is UserRole.Adjuster or UserRole.Admin)
        {
            actions.Add(State(ClaimAction.Review, ReviewBlock(status)));
            var decide = DecideBlock(status, assignedAdjusterId, user);
            actions.Add(State(ClaimAction.Approve, decide));
            actions.Add(State(ClaimAction.Reject, decide));
            actions.Add(State(ClaimAction.Pay, PayBlock(status)));
        }
        if (ClaimService.CanWithdrawRole(user.Role))
        {
            actions.Add(State(ClaimAction.Withdraw,
                !IsOpen(status) ? ClaimActionBlock.Closed
                : !writable ? ClaimActionBlock.OutsideYourBook
                : null));
        }
        return actions;
    }

    private static ClaimActionState State(ClaimAction action, string? block) => new(action, block is null, block);

    private static bool IsOpen(ClaimStatus status) => status is ClaimStatus.Submitted or ClaimStatus.UnderReview;

    private static string? ReviewBlock(ClaimStatus status) => status switch
    {
        ClaimStatus.Submitted => null,
        ClaimStatus.UnderReview => ClaimActionBlock.AlreadyInReview,
        ClaimStatus.Withdrawn => ClaimActionBlock.Withdrawn,
        _ => ClaimActionBlock.AlreadyDecided
    };

    private static string? DecideBlock(ClaimStatus status, Guid? assignedAdjusterId, ICurrentUser user) => status switch
    {
        ClaimStatus.Submitted => ClaimActionBlock.StartReviewFirst,
        ClaimStatus.UnderReview when user.Role != UserRole.Admin && assignedAdjusterId != user.UserId
            => ClaimActionBlock.AssignedToAnother,
        ClaimStatus.UnderReview => null,
        ClaimStatus.Withdrawn => ClaimActionBlock.Withdrawn,
        _ => ClaimActionBlock.AlreadyDecided
    };

    private static string? PayBlock(ClaimStatus status) => status switch
    {
        ClaimStatus.Approved => null,
        ClaimStatus.Paid => ClaimActionBlock.AlreadyPaid,
        ClaimStatus.Withdrawn => ClaimActionBlock.Withdrawn,
        _ => ClaimActionBlock.NotApproved
    };
}
