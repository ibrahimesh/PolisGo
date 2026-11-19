import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderWithProviders } from '../../test/utils';
import { DateField } from './DateField';

function Harness({
  initial = '',
  min,
  max,
  onValue,
}: {
  initial?: string;
  min?: string;
  max?: string;
  onValue?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      label="Start date"
      value={value}
      min={min}
      max={max}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

const field = () => screen.getByRole('textbox', { name: 'Start date' });

describe('DateField', () => {
  it('types as DD.MM.YYYY and hands the form an ISO date', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithProviders(<Harness onValue={onValue} />);

    await user.type(field(), '14032025');
    expect(field()).toHaveValue('14.03.2025');
    expect(onValue).toHaveBeenLastCalledWith('2025-03-14');
  });

  it('keeps an incomplete or impossible date as text for the schema to reject', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithProviders(<Harness onValue={onValue} />);

    await user.type(field(), '3102');
    expect(onValue).toHaveBeenLastCalledWith('31.02');
    await user.type(field(), '2025');
    expect(onValue).toHaveBeenLastCalledWith('2025-02-31');
  });

  it('takes a pasted date in ISO or day-first form', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithProviders(<Harness onValue={onValue} />);

    await user.click(field());
    await user.paste('2025-03-04');
    expect(field()).toHaveValue('04.03.2025');
    await user.clear(field());
    await user.paste('14/03/2025');
    expect(onValue).toHaveBeenLastCalledWith('2025-03-14');
  });

  it('explains the allowed range and shows an existing value', () => {
    renderWithProviders(<Harness initial="2025-03-14" min="2025-03-01" max="2025-03-31" />);
    expect(field()).toHaveValue('14.03.2025');
    expect(field()).toHaveAccessibleDescription('From 01.03.2025 to 31.03.2025.');
  });

  it('picks a day from the keyboard and returns focus to the button', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithProviders(<Harness initial="2025-03-14" onValue={onValue} />);

    const button = screen.getByRole('button', { name: 'Open calendar' });
    await user.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Choose a date' });
    expect(dialog).toBeInTheDocument();
    // Focus starts on the value; arrows move by day and week, PageDown by month.
    expect(screen.getByRole('button', { name: 'Friday, 14 March 2025' })).toHaveFocus();
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Saturday, 22 March 2025' })).toHaveFocus();
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('button', { name: 'Tuesday, 22 April 2025' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(onValue).toHaveBeenLastCalledWith('2025-04-22');
    expect(field()).toHaveValue('22.04.2025');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('refuses days outside min and max, and Escape closes without a change', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithProviders(
      <Harness initial="2025-03-10" min="2025-03-05" max="2025-03-12" onValue={onValue} />,
    );

    await user.click(screen.getByRole('button', { name: 'Open calendar' }));
    const outside = screen.getByRole('button', { name: 'Thursday, 13 March 2025' });
    expect(outside).toHaveAttribute('aria-disabled', 'true');
    await user.click(outside);
    expect(onValue).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('From 05.03.2025 to 12.03.2025.');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field()).toHaveValue('10.03.2025');
  });
});
