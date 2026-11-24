namespace PolisGo.Domain.Enums;

// Staff actions recorded in the audit log. Claim and policy status changes
// have their own history tables and are read from there.
public enum AuditAction
{
    StaffCreated,
    StaffDeactivated,
    StaffReactivated,
    RoleChanged,
    CustomerAssigned,
    // Error tracking (System section): a group's status changed by an admin,
    // and resolved groups purged.
    ErrorResolved,
    ErrorIgnored,
    ErrorReopened,
    ErrorsPurged
}
