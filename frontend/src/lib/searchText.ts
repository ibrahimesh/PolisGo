// The same case folding as the API's SearchText.Fold: lower case, every I
// (I, İ, ı, i) as "i", ё as е, NFC, whitespace collapsed. JavaScript's
// toLowerCase turns "İ" into "i" plus a combining dot, so it is mapped first.
export function foldSearch(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[Iİı]/g, 'i')
    .replace(/[Ёё]/g, 'е')
    .toLowerCase()
    .replace(/̇/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
