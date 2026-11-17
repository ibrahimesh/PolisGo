using PolisGo.Application.Auth;
using M = PolisGo.Application.Auth.AuthValidation.Messages;

namespace PolisGo.Tests.Auth;

public class AuthValidationTests
{
    private static readonly DateTime Today = new(2026, 11, 18);

    [Theory]
    [InlineData("+994 50 123 45 67")]
    [InlineData("+994501234567")]
    [InlineData("994501234567")]
    [InlineData("00994 50 123 45 67")]
    [InlineData("0501234567")]
    [InlineData("050-123-45-67")]
    [InlineData("(50) 123 45 67")]
    [InlineData("501234567")]
    public void Phone_variants_normalise_to_E164(string input)
    {
        Assert.Equal("+994501234567", AuthValidation.NormalizeAzerbaijaniPhone(input));
    }

    [Fact]
    public void Phone_national_number_may_start_with_99()
    {
        // 99 is an operator code; without + it must not be read as the country code.
        Assert.Equal("+994994123456", AuthValidation.NormalizeAzerbaijaniPhone("994123456"));
    }

    [Theory]
    [InlineData("1")]
    [InlineData("12345")]
    [InlineData("+994 50 123 45")]          // 8 digits
    [InlineData("+994 50 123 45 678")]      // 10 digits
    [InlineData("+994 012345678")]          // national can't start with 0
    [InlineData("+7 912 345 67 89")]        // another country
    [InlineData("")]
    [InlineData(null)]
    public void Phone_invalid_values_are_rejected(string? input)
    {
        Assert.Null(AuthValidation.NormalizeAzerbaijaniPhone(input));
    }

    [Theory]
    [InlineData("leyla@mail.az", null)]
    [InlineData("first.last+tag@sub.example.com", null)]
    [InlineData("", M.EmailRequired)]
    [InlineData("   ", M.EmailRequired)]
    [InlineData("abc@", M.EmailInvalid)]
    [InlineData("user@localhost", M.EmailInvalid)]
    [InlineData("user@polisgo", M.EmailInvalid)]
    [InlineData("two@@at.az", M.EmailInvalid)]
    [InlineData("Name <a@b.az>", M.EmailInvalid)]
    [InlineData("spa ce@mail.az", M.EmailInvalid)]
    public void Email_rules(string email, string? expected)
    {
        Assert.Equal(expected, AuthValidation.EmailError(email));
    }

    [Fact]
    public void Email_over_254_characters_is_rejected()
    {
        Assert.Equal(M.EmailInvalid, AuthValidation.EmailError(new string('a', 250) + "@x.az"));
    }

    [Theory]
    [InlineData("Secret12", null)]
    [InlineData("Şifrə123", null)]          // non-ASCII letters count
    [InlineData("", M.PasswordRequired)]
    [InlineData("Short1A", M.PasswordPolicy)]
    [InlineData("password1", M.PasswordPolicy)]  // no uppercase
    [InlineData("PASSWORD1", M.PasswordPolicy)]  // no lowercase
    [InlineData("Passwordx", M.PasswordPolicy)]  // no digit
    public void Password_rules(string password, string? expected)
    {
        Assert.Equal(expected, AuthValidation.PasswordError(password));
    }

    [Fact]
    public void Password_longer_than_64_is_rejected()
    {
        Assert.Equal(M.PasswordPolicy, AuthValidation.PasswordError("Aa1" + new string('x', 62)));
        Assert.Null(AuthValidation.PasswordError("Aa1" + new string('x', 61)));
    }

    [Theory]
    [InlineData("Leyla Məmmədova", null)]
    [InlineData("Rəşad Əliyev-Qasımov", null)]
    [InlineData("Анна О’Нил", null)]
    [InlineData("J. R. Smith", null)]
    [InlineData("", M.FullNameRequired)]
    [InlineData("x", M.FullNameInvalid)]
    [InlineData("R2D2 Droid", M.FullNameInvalid)]
    [InlineData("<script>", M.FullNameInvalid)]
    public void Full_name_rules(string name, string? expected)
    {
        Assert.Equal(expected, AuthValidation.FullNameError(name));
    }

    [Theory]
    [InlineData("1990-05-01", null)]
    [InlineData("2008-11-18", null)]                      // exactly 18 today
    [InlineData("2008-11-19", M.Underage)]                // 18 tomorrow
    [InlineData("2015-01-01", M.Underage)]
    [InlineData("2026-11-18", M.BirthDateInFuture)]
    [InlineData("1926-11-17", M.BirthDateOutOfRange)]
    public void Birth_date_rules(string birth, string? expected)
    {
        Assert.Equal(expected, AuthValidation.BirthDateError(DateTime.Parse(birth), Today));
    }

    [Theory]
    [InlineData("2010-06-01", null)]
    [InlineData("2008-05-01", null)]                       // the 18th birthday itself
    [InlineData("2008-04-30", M.LicenceBefore18)]
    [InlineData("2026-11-19", M.LicenceInFuture)]
    public void Licence_date_rules(string licence, string? expected)
    {
        Assert.Equal(expected,
            AuthValidation.LicenceDateError(DateTime.Parse(licence), new DateTime(1990, 5, 1), Today));
    }
}
