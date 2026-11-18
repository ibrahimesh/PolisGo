import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

// Product codes come from the API; the readable name and hint are
// translations, with the bare code as the fallback for a product added later.
export function useProductName() {
  const { t } = useTranslation();
  const name = useCallback(
    (code: string) => t(`calculator.products.${code}`, { defaultValue: code }),
    [t],
  );
  const hint = useCallback(
    (code: string) => t(`calculator.products.${code}Hint`, { defaultValue: '' }),
    [t],
  );
  return { name, hint };
}
