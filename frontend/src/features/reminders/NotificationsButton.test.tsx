import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { NotificationsButton } from './NotificationsButton';

interface Item {
  id: string;
  readAt: string | null;
}

const state = vi.hoisted(() => ({ reminders: [] as Item[], updates: [] as Item[] }));

vi.mock('../cabinet/queries', () => ({
  useReminders: () => ({ data: state.reminders, isPending: false, isError: false }),
  useClaimUpdates: () => ({ data: state.updates, isPending: false, isError: false }),
  useInvalidateCabinet: () => () => undefined,
}));
// The panel's lists aren't what this test is about.
vi.mock('./ReminderList', () => ({ ReminderList: () => null }));
vi.mock('./ClaimUpdateList', () => ({ ClaimUpdateList: () => null }));

describe('NotificationsButton', () => {
  it('rings once when a new notification arrives, not on the first load', () => {
    state.reminders = [{ id: 'a', readAt: null }];
    state.updates = [];
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    const view = render(<NotificationsButton />, { wrapper });
    const bell = () => screen.getAllByRole('button')[0]?.querySelector('[data-rings]');
    expect(bell()).toHaveAttribute('data-rings', '0');
    expect(bell()).not.toHaveClass('animate-bell-ring');

    state.updates = [{ id: 'u', readAt: null }];
    view.rerender(<NotificationsButton />);
    expect(bell()).toHaveAttribute('data-rings', '1');
    expect(bell()).toHaveClass('animate-bell-ring');

    // Reading one lowers the count: no ring.
    state.reminders = [];
    view.rerender(<NotificationsButton />);
    expect(bell()).toHaveAttribute('data-rings', '1');
  });
});
