import type { TFunction } from 'i18next';
import type { PolicyDetailResponse } from '../../api/types';
import { COVERAGE_BY_CODE } from '../landing/coverage';
import { termMonths } from '../policies/policyDates';
import type { CertificateContent, Row } from './certificatePdf';

export interface CertificateFormatters {
  date: (isoDate: string) => string;
  dateTime: (iso: string) => string;
  money: (value: number, currency?: string) => string;
  factor: (value: number) => string;
  integer: (value: number) => string;
}

const FACTORS = [
  'engineFactor',
  'driverAgeFactor',
  'experienceFactor',
  'vehicleAgeFactor',
  'bonusMalusFactor',
  'termFactor',
] as const;

// Everything the PDF prints, translated and formatted in the user's language.
export function certificateContent(
  detail: PolicyDetailResponse,
  t: TFunction,
  format: CertificateFormatters,
  language: string,
  generatedAt: string,
): CertificateContent {
  const { policy, vehicle, pricing } = detail;
  const code = policy.policyTypeCode;
  const payment = detail.payments.find((p) => p.status === 'Completed');
  const covers = COVERAGE_BY_CODE[code]?.covers ?? [];

  const rows = (...pairs: [string, string][]): Row[] =>
    pairs.map(([label, value]) => ({ label, value }));

  return {
    language,
    documentTitle: t('certificate.documentTitle', { number: policy.policyNumber }),
    titleLead: t('certificate.titleLead'),
    titleAccent: t('certificate.titleAccent'),
    product: t(`calculator.products.${code}`, { defaultValue: code }),
    productHint: t(`calculator.products.${code}Hint`, { defaultValue: '' }),
    numberLabel: t('certificate.number'),
    policyNumber: policy.policyNumber,
    status: t(`policyStatus.${policy.status}`),
    sections: [
      {
        heading: t('certificate.holder'),
        rows: rows([t('certificate.name'), detail.holderName]),
      },
      {
        heading: t('certificate.vehicle'),
        rows: rows(
          [t('certificate.makeModel'), `${vehicle.make} ${vehicle.model}, ${vehicle.year}`],
          [t('certificate.plate'), vehicle.plateNumber],
          [t('certificate.vin'), vehicle.vin],
          [
            t('certificate.engine'),
            t('certificate.engineValue', { cc: format.integer(vehicle.engineCapacityCc) }),
          ],
        ),
      },
      {
        heading: t('certificate.period'),
        rows: rows(
          [t('certificate.from'), format.date(policy.startDate)],
          [t('certificate.to'), t('certificate.toValue', { date: format.date(policy.endDate) })],
          [
            t('certificate.term'),
            t('calculator.termOption', { count: termMonths(policy.startDate, policy.endDate) }),
          ],
        ),
      },
      {
        heading: t('certificate.payment'),
        rows: payment
          ? rows(
              [t('certificate.premium'), format.money(payment.amount, payment.currency)],
              [t('certificate.paidOn'), format.dateTime(payment.paidAt)],
              [t('certificate.reference'), payment.reference ?? '—'],
            )
          : rows([t('certificate.premium'), format.money(policy.premium, policy.currency)]),
      },
    ],
    coverage: {
      heading: t('certificate.coverage'),
      items: covers.length
        ? covers.map((cover) => t(`landing.coverage.rows.${cover}`))
        : [t('certificate.coverageUnknown')],
    },
    pricing: pricing
      ? {
          heading: t('certificate.pricing'),
          rows: [
            {
              label: t('calculator.factor.baseRate'),
              value: format.money(pricing.baseRate, pricing.currency),
            },
            ...FACTORS.map((key) => ({
              label: t(`calculator.factor.${key}`),
              value: format.factor(pricing[key]),
            })),
          ],
          total: {
            label: t('calculator.factor.premium'),
            value: format.money(pricing.premium, pricing.currency),
          },
        }
      : null,
    notes: [t('certificate.disclaimer')],
    footer: t('certificate.footer', { date: generatedAt }),
  };
}
