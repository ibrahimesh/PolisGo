import { firstName, initials } from './names';

describe('names', () => {
  it.each([
    ['Leyla Məmmədova', 'LM'],
    ['  aysel  ', 'A'],
    ['Nigar Əli qızı Həsənova', 'NH'],
    ['Иван Петров', 'ИП'],
    ['', ''],
  ])('initials(%j) is %j', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it('greets by the first word', () => {
    expect(firstName(' Leyla Məmmədova ')).toBe('Leyla');
  });
});
