import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../api/errors';
import type { CurrentUserResponse } from '../api/types';
import { AuthContext } from '../auth/AuthContext';
import type { AuthContextValue, AuthStatus } from '../auth/AuthContext';
import { renderWithProviders } from '../test/utils';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';

const someone: CurrentUserResponse = {
  id: '7d1c1f5e-0000-4000-8000-000000000001',
  email: 'previous.user@mail.az',
  fullName: 'Previous User',
  role: 'Client',
};

function auth(status: AuthStatus, overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status,
    user: status === 'authenticated' ? someone : null,
    error: null,
    login: vi.fn().mockResolvedValue(someone),
    register: vi.fn().mockResolvedValue(someone),
    logout: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function renderRegister(value: AuthContextValue) {
  return renderWithProviders(
    <AuthContext.Provider value={value}>
      <RegisterPage />
    </AuthContext.Provider>,
    { route: '/register' },
  );
}

async function fillValidRegister(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Leyla Məmmədova');
  await user.type(screen.getByLabelText('Email'), 'Leyla.M@Mail.az');
  await user.type(screen.getByLabelText('Phone'), '0501234567');
  await user.type(screen.getByLabelText('Date of birth'), '1990-05-01');
  await user.type(screen.getByLabelText('Driving licence issued on'), '2010-06-01');
  await user.type(screen.getByLabelText('Password'), 'Secret123');
  await user.type(screen.getByLabelText('Repeat password'), 'Secret123');
}

describe('Register form', () => {
  it('blocks an empty submit: summary, every field invalid, focus on the first', async () => {
    const user = userEvent.setup();
    const value = auth('anonymous');
    renderRegister(value);

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('7 fields need attention')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveFocus();
    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Phone')).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('register-phone-error'),
    );
    expect(value.register).not.toHaveBeenCalled();
  });

  it('shows the specific rule that failed for each invalid value', async () => {
    const user = userEvent.setup();
    const value = auth('anonymous');
    renderRegister(value);

    await user.type(screen.getByLabelText('Full name'), 'x');
    await user.type(screen.getByLabelText('Email'), 'abc@');
    await user.type(screen.getByLabelText('Phone'), '12');
    await user.type(screen.getByLabelText('Date of birth'), '2015-01-01');
    await user.type(screen.getByLabelText('Password'), 'abc');
    await user.type(screen.getByLabelText('Repeat password'), 'abd');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const summary = await screen.findByTestId('error-summary');
    for (const message of [
      'Use 2–100 letters; spaces, hyphens and apostrophes are fine.',
      'Enter a valid email, like name@example.com.',
      'Enter an Azerbaijani number: +994 and 9 digits.',
      'You must be at least 18 to open an account.',
      'Use 8–64 characters with an uppercase letter, a lowercase letter and a number.',
      'Passwords don’t match.',
    ]) {
      expect(summary).toHaveTextContent(message);
    }
    expect(value.register).not.toHaveBeenCalled();
  });

  it('masks the phone, shows live password rules, and sends normalised values', async () => {
    const user = userEvent.setup();
    const value = auth('anonymous');
    renderRegister(value);

    await fillValidRegister(user);
    expect(screen.getByLabelText('Phone')).toHaveValue('+994 50 123 45 67');
    const rules = screen.getByRole('list', { name: 'Password requirements' });
    expect(rules).toHaveTextContent('An uppercase letter(done)');
    expect(screen.getByText('Fair')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(value.register).toHaveBeenCalledOnce());
    expect(value.register).toHaveBeenCalledWith({
      fullName: 'Leyla Məmmədova',
      email: 'leyla.m@mail.az',
      phone: '+994501234567',
      birthDate: '1990-05-01',
      drivingLicenseDate: '2010-06-01',
      password: 'Secret123',
    });
  });

  it('maps a server 400 onto the field and focuses it', async () => {
    const user = userEvent.setup();
    const value = auth('anonymous', {
      register: vi.fn().mockRejectedValue(
        new ApiError('http', 400, {
          status: 400,
          title: 'Validation failed',
          errors: { Phone: ['Something the client did not anticipate.'] },
          traceId: '00-abc-01',
        }),
      ),
    });
    renderRegister(value);

    await fillValidRegister(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const phone = screen.getByLabelText('Phone');
    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'));
    expect(phone).toHaveFocus();
    expect(screen.getByTestId('error-summary')).toHaveTextContent(
      "Phone: This value isn't accepted.",
    );
  });
});

describe('Sign-in with an existing session in the tab', () => {
  it('does not render the form while the stored session is being verified', () => {
    renderWithProviders(
      <AuthContext.Provider value={auth('loading')}>
        <LoginPage />
      </AuthContext.Provider>,
      { route: '/login' },
    );
    expect(screen.getByText('Checking your session…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('says who is signed in instead of silently redirecting', async () => {
    const user = userEvent.setup();
    const value = auth('authenticated');
    renderWithProviders(
      <AuthContext.Provider value={value}>
        <LoginPage />
      </AuthContext.Provider>,
      { route: '/login' },
    );

    expect(screen.getByRole('heading', { name: 'You’re already signed in' })).toBeInTheDocument();
    expect(screen.getByText(/Previous User \(previous\.user@mail\.az\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(value.logout).toHaveBeenCalledOnce();
  });

  it('validates the login email before calling the API', async () => {
    const user = userEvent.setup();
    const value = auth('anonymous');
    renderWithProviders(
      <AuthContext.Provider value={value}>
        <LoginPage />
      </AuthContext.Provider>,
      { route: '/login' },
    );

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('1 field needs attention')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(value.login).not.toHaveBeenCalled();
  });
});
