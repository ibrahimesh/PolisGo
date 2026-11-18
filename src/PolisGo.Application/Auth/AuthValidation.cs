using System.Net.Mail;
using System.Text.RegularExpressions;

namespace PolisGo.Application.Auth;

// Account rules shared by self-registration and staff provisioning. The SPA
// mirrors them (frontend/src/features/auth/validation.ts + authSchemas.ts)
// for instant feedback; this is the authority. Messages are stable English
// strings the SPA maps to translations — change both sides together.
public static partial class AuthValidation
{
    public const int EmailMaxLength = 254;
    public const int PasswordMinLength = 8;
    // BCrypt only hashes the first 72 bytes; 64 chars keeps multi-byte input safe.
    public const int PasswordMaxLength = 64;
    public const int FullNameMinLength = 2;
    public const int FullNameMaxLength = 100;
    public const int MinAge = 18;
    public const int MaxAge = 100;

    public static class Messages
    {
        public const string EmailRequired = "Email is required.";
        public const string EmailInvalid = "Email is not a valid address.";
        public const string PasswordRequired = "Password is required.";
        public const string PasswordPolicy =
            "Password must be 8-64 characters and include an uppercase letter, a lowercase letter and a digit.";
        public const string FullNameRequired = "Full name is required.";
        public const string FullNameInvalid =
            "Full name must be 2-100 letters; spaces, hyphens and apostrophes are allowed.";
        public const string PhoneRequired = "Phone is required.";
        public const string PhoneInvalid =
            "Phone must be an Azerbaijani number: +994 followed by 9 digits.";
        public const string BirthDateInFuture = "Birth date must be in the past.";
        public const string Underage = "The customer must be at least 18 years old.";
        public const string BirthDateOutOfRange = "Birth date must be within the last 100 years.";
        public const string LicenceInFuture = "Driving licence date must not be in the future.";
        public const string LicenceBefore18 = "Driving licence date must be after the customer turns 18.";
        public const string CurrentPasswordRequired = "Current password is required.";
        public const string CurrentPasswordIncorrect = "Current password is incorrect.";
        public const string PasswordUnchanged = "New password must be different from the current one.";
        public const string PhoneNotApplicable = "Staff accounts have no phone on file.";
    }

    // One @, a dotted domain and a 2+ letter TLD. MailAddress alone accepts
    // "user@localhost" and display-name forms, which a sign-up form must not.
    [GeneratedRegex(@"^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$")]
    private static partial Regex EmailPattern();

    // Letters in any script (ə, ş, Cyrillic…), combining marks, spaces,
    // hyphens, apostrophes and dots; must start with a letter.
    [GeneratedRegex(@"^\p{L}[\p{L}\p{M}'’.\- ]*[\p{L}.]$")]
    private static partial Regex FullNamePattern();

    public static string? EmailError(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return Messages.EmailRequired;
        var trimmed = email.Trim();
        if (trimmed.Length > EmailMaxLength || !EmailPattern().IsMatch(trimmed)) return Messages.EmailInvalid;
        try
        {
            return new MailAddress(trimmed).Address == trimmed ? null : Messages.EmailInvalid;
        }
        catch (FormatException)
        {
            return Messages.EmailInvalid;
        }
    }

    public static string? PasswordError(string? password)
    {
        if (string.IsNullOrEmpty(password)) return Messages.PasswordRequired;
        var ok = password.Length is >= PasswordMinLength and <= PasswordMaxLength
            && password.Any(char.IsUpper)
            && password.Any(char.IsLower)
            && password.Any(char.IsDigit);
        return ok ? null : Messages.PasswordPolicy;
    }

    public static string? FullNameError(string? fullName)
    {
        if (string.IsNullOrWhiteSpace(fullName)) return Messages.FullNameRequired;
        var trimmed = fullName.Trim();
        return trimmed.Length is >= FullNameMinLength and <= FullNameMaxLength
            && FullNamePattern().IsMatch(trimmed)
            ? null
            : Messages.FullNameInvalid;
    }

    // Accepts what people actually type or paste — "+994 50 123 45 67",
    // "994501234567", "0501234567", "(50) 123-45-67" — and returns E.164
    // (+994XXXXXXXXX), or null if it isn't a 9-digit Azerbaijani number.
    public static string? NormalizeAzerbaijaniPhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;
        var trimmed = phone.Trim();
        var digits = new string(trimmed.Where(char.IsAsciiDigit).ToArray());
        var international = trimmed.StartsWith('+') || trimmed.StartsWith("00", StringComparison.Ordinal);

        if (trimmed.StartsWith("00", StringComparison.Ordinal)) digits = digits[2..];
        // National numbers may start with 99 (an operator code), so 994 is only
        // the country code when explicit or when the number is too long.
        if (digits.StartsWith("994", StringComparison.Ordinal) && (international || digits.Length > 9))
            digits = digits[3..];
        if (digits.StartsWith('0')) digits = digits[1..];

        return digits.Length == 9 && digits[0] != '0' ? "+994" + digits : null;
    }

    public static string? BirthDateError(DateTime birthDate, DateTime today)
    {
        var date = birthDate.Date;
        if (date >= today) return Messages.BirthDateInFuture;
        if (date > today.AddYears(-MinAge)) return Messages.Underage;
        if (date < today.AddYears(-MaxAge)) return Messages.BirthDateOutOfRange;
        return null;
    }

    public static string? LicenceDateError(DateTime licenceDate, DateTime birthDate, DateTime today)
    {
        var date = licenceDate.Date;
        if (date > today) return Messages.LicenceInFuture;
        if (date < birthDate.Date.AddYears(MinAge)) return Messages.LicenceBefore18;
        return null;
    }
}
