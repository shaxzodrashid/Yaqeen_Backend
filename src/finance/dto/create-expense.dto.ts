import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency } from '../../currency/currency.types';

export enum ExpenseSection {
  FTL = 'ftl',
  LTL = 'ltl',
}

export enum ExpenseCategory {
  // FTL & Shared
  TAX = 'tax',
  UTILITY = 'utility',
  RENT = 'rent',
  SALARY_PAYOUT = 'salary_payout',
  CLEANER = 'cleaner',
  KPI = 'kpi',
  FOOD = 'food',
  OTHER = 'other',
  // LTL specific
  CHINA_WAREHOUSE = 'china_warehouse',
  FIRM_SERVICE = 'firm_service',
  DECLARANT = 'declarant',
}

export const FTL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  ExpenseCategory.TAX,
  ExpenseCategory.UTILITY,
  ExpenseCategory.RENT,
  ExpenseCategory.SALARY_PAYOUT,
  ExpenseCategory.CLEANER,
  ExpenseCategory.KPI,
  ExpenseCategory.FOOD,
  ExpenseCategory.OTHER,
];

export const LTL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  ExpenseCategory.RENT,
  ExpenseCategory.SALARY_PAYOUT,
  ExpenseCategory.CHINA_WAREHOUSE,
  ExpenseCategory.FIRM_SERVICE,
  ExpenseCategory.FOOD,
  ExpenseCategory.DECLARANT,
];

export const ALL_EXPENSE_CATEGORIES: ExpenseCategory[] =
  Object.values(ExpenseCategory);

export interface SectionCategoryMetadata {
  category: ExpenseCategory;
  section: ExpenseSection;
  label: string;
  description: string;
}

export const FTL_CATEGORIES_METADATA: Record<
  ExpenseCategory,
  SectionCategoryMetadata
> = {
  [ExpenseCategory.TAX]: {
    category: ExpenseCategory.TAX,
    section: ExpenseSection.FTL,
    label: 'Nalog',
    description: 'Government taxes, official fees, legal payments',
  },
  [ExpenseCategory.UTILITY]: {
    category: ExpenseCategory.UTILITY,
    section: ExpenseSection.FTL,
    label: 'Komunalka',
    description: 'Electricity, internet, water, office utilities',
  },
  [ExpenseCategory.RENT]: {
    category: ExpenseCategory.RENT,
    section: ExpenseSection.FTL,
    label: 'Arenda',
    description: 'Office space and operational facilities rent',
  },
  [ExpenseCategory.SALARY_PAYOUT]: {
    category: ExpenseCategory.SALARY_PAYOUT,
    section: ExpenseSection.FTL,
    label: 'Oylik',
    description: 'Manual salary payouts to staff',
  },
  [ExpenseCategory.CLEANER]: {
    category: ExpenseCategory.CLEANER,
    section: ExpenseSection.FTL,
    label: 'Cleaning',
    description: 'Office cleaning services, sanitation supplies',
  },
  [ExpenseCategory.KPI]: {
    category: ExpenseCategory.KPI,
    section: ExpenseSection.FTL,
    label: 'KPI bonus',
    description: 'Employee KPI payouts, performance bonuses, incentives',
  },
  [ExpenseCategory.FOOD]: {
    category: ExpenseCategory.FOOD,
    section: ExpenseSection.FTL,
    label: 'Pitaniya',
    description: 'Staff meals, office tea/coffee, snacks and food expenses',
  },
  [ExpenseCategory.OTHER]: {
    category: ExpenseCategory.OTHER,
    section: ExpenseSection.FTL,
    label: 'Prochiy',
    description: 'Miscellaneous unclassified operational costs',
  },
} as any;

export const LTL_CATEGORIES_METADATA: Record<
  ExpenseCategory,
  SectionCategoryMetadata
> = {
  [ExpenseCategory.RENT]: {
    category: ExpenseCategory.RENT,
    section: ExpenseSection.LTL,
    label: 'Arenda',
    description: 'Warehouse and office space rent',
  },
  [ExpenseCategory.SALARY_PAYOUT]: {
    category: ExpenseCategory.SALARY_PAYOUT,
    section: ExpenseSection.LTL,
    label: 'Oylik',
    description: 'Manual salary payouts to staff',
  },
  [ExpenseCategory.CHINA_WAREHOUSE]: {
    category: ExpenseCategory.CHINA_WAREHOUSE,
    section: ExpenseSection.LTL,
    label: 'Xitoy sklad',
    description: 'China consolidation warehouse storage and processing costs',
  },
  [ExpenseCategory.FIRM_SERVICE]: {
    category: ExpenseCategory.FIRM_SERVICE,
    section: ExpenseSection.LTL,
    label: 'Firma usluga',
    description: 'Third-party agency fees, brokerage, partner firm services',
  },
  [ExpenseCategory.FOOD]: {
    category: ExpenseCategory.FOOD,
    section: ExpenseSection.LTL,
    label: 'Pitanya',
    description: 'Staff meals, office tea/coffee, snacks and food expenses',
  },
  [ExpenseCategory.DECLARANT]: {
    category: ExpenseCategory.DECLARANT,
    section: ExpenseSection.LTL,
    label: 'Deklarant',
    description: 'Customs declaration processing and declarant fees',
  },
} as any;

export function getCategoriesForSection(
  section: ExpenseSection,
): ExpenseCategory[] {
  return section === ExpenseSection.LTL
    ? LTL_EXPENSE_CATEGORIES
    : FTL_EXPENSE_CATEGORIES;
}

export function isCategoryAllowedInSection(
  category: ExpenseCategory,
  section: ExpenseSection,
): boolean {
  if (section === ExpenseSection.LTL) {
    return LTL_EXPENSE_CATEGORIES.includes(category);
  }
  return FTL_EXPENSE_CATEGORIES.includes(category);
}

export function inferSectionForCategory(
  category: ExpenseCategory,
): ExpenseSection {
  if (
    LTL_EXPENSE_CATEGORIES.includes(category) &&
    !FTL_EXPENSE_CATEGORIES.includes(category)
  ) {
    return ExpenseSection.LTL;
  }
  return ExpenseSection.FTL;
}

export class CreateExpenseDto {
  @IsOptional()
  @IsEnum(ExpenseSection, {
    message: 'section must be one of: ftl, ltl',
  })
  section?: ExpenseSection;

  @IsEnum(ExpenseCategory, {
    message:
      'category must be one of: tax, utility, rent, salary_payout, cleaner, kpi, food, other, china_warehouse, firm_service, declarant',
  })
  category: ExpenseCategory;

  @Type(() => Number)
  @IsNumber({}, { message: 'amount must be a number' })
  @Min(0.01, { message: 'amount must be greater than 0' })
  amount: number;

  @IsOptional()
  @IsEnum(Currency, {
    message: 'currency must be one of: UZS, USD, RUB, RMB, CNY',
  })
  currency?: Currency;

  @IsOptional()
  @IsUUID('4', { message: 'employee_id must be a valid UUID' })
  employee_id?: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  description?: string;

  @IsDateString(
    {},
    { message: 'expense_date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  expense_date: string;
}
