import './systemI18n';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button';
import { SearchIcon } from '../../../components/ui/icons';
import { Input } from '../../../components/ui/Input';
import { asReference, lookupPath } from './errorParams';

// "Paste the Reference a user quoted": 8 characters (a dash, spaces and case
// don't matter) or a full trace id. Opens the matching error.
export function ReferenceLookup({ focus = false }: { focus?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const headingId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const ownRef = useRef<HTMLInputElement>(null);
  // The palette's "Find error by Reference" opens the page ready to paste.
  useEffect(() => {
    if (focus) ownRef.current?.focus();
  }, [focus]);

  const submit = () => {
    const code = asReference(value);
    if (!code) {
      setError('admin.system.lookup.invalid');
      ownRef.current?.focus();
      return;
    }
    // A full trace id is more precise than its first 8 characters.
    const compact = value.trim().replace(/[\s\-_:]/g, '');
    void navigate(lookupPath(/^[0-9a-f]{32}$/i.test(compact) ? compact : value.trim()));
  };

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <h2 id={headingId} className="text-xl">
        {t('admin.system.lookup.title')}
      </h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        noValidate
        className="flex flex-col gap-3 sm:flex-row sm:items-start"
      >
        <div className="min-w-0 flex-1 sm:max-w-md">
          <Input
            ref={ownRef}
            id="reference-lookup"
            label={t('admin.system.lookup.label')}
            hint={t('admin.system.lookup.hint')}
            error={error}
            value={value}
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            placeholder="8F05E497"
            className="tracking-wide uppercase placeholder:normal-case"
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(undefined);
            }}
          />
        </div>
        <Button type="submit" variant="secondary" className="sm:mt-7">
          <SearchIcon />
          {t('admin.system.lookup.submit')}
        </Button>
      </form>
    </section>
  );
}
