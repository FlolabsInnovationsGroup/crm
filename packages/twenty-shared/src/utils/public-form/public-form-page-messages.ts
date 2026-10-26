import { type PublicFormDefinition } from './public-form-definition-schema';

type PublicFormLanguage = PublicFormDefinition['settings']['language'];

export type PublicFormPageMessages = {
  required: string;
  email: string;
  phone: string;
  url: string;
  number: string;
  date: string;
  choose: string;
  chooseMany: string;
  minLength: string;
  maxLength: string;
  minValue: string;
  maxValue: string;
  minSelections: string;
  maxSelections: string;
  pattern: string;
  fileRequired: string;
  fileTooLarge: string;
  fileTypes: string;
  sending: string;
  genericError: string;
  tooManyRequests: string;
  fixErrors: string;
  selectPlaceholder: string;
  chooseFile: string;
  noFileChosen: string;
  next: string;
  back: string;
  stepOf: string;
  notFoundTitle: string;
  notFoundMessage: string;
};

export const PUBLIC_FORM_PAGE_MESSAGES: Record<
  PublicFormLanguage,
  PublicFormPageMessages
> = {
  en: {
    required: 'This field is required',
    email: 'Enter a valid email address',
    phone: 'Enter a valid phone number',
    url: 'Enter a valid link starting with http:// or https://',
    number: 'Enter a number',
    date: 'Enter a valid date',
    choose: 'Choose one of the options',
    chooseMany: 'Choose from the listed options',
    minLength: 'Enter at least {n} characters',
    maxLength: 'Enter at most {n} characters',
    minValue: 'Enter {n} or more',
    maxValue: 'Enter {n} or less',
    minSelections: 'Choose at least {n} options',
    maxSelections: 'Choose at most {n} options',
    pattern: 'Enter a value in the expected format',
    fileRequired: 'Please attach a file',
    fileTooLarge: 'This file is too large',
    fileTypes: 'Allowed file types: ',
    sending: 'Sending…',
    genericError: 'Something went wrong. Please try again.',
    tooManyRequests: 'Too many attempts. Please wait a minute and try again.',
    fixErrors: 'Please check the highlighted fields.',
    selectPlaceholder: 'Select…',
    chooseFile: 'Choose a file',
    noFileChosen: 'No file chosen',
    next: 'Next',
    back: 'Back',
    stepOf: 'Step {current} of {total}',
    notFoundTitle: 'Form not available',
    notFoundMessage:
      'This form does not exist or is no longer accepting answers.',
  },
  ar: {
    required: 'هذا الحقل مطلوب',
    email: 'أدخل بريدًا إلكترونيًا صحيحًا',
    phone: 'أدخل رقم هاتف صحيحًا',
    url: 'أدخل رابطًا صحيحًا يبدأ بـ http:// أو https://',
    number: 'أدخل رقمًا',
    date: 'أدخل تاريخًا صحيحًا',
    choose: 'اختر أحد الخيارات',
    chooseMany: 'اختر من الخيارات المتاحة',
    minLength: 'أدخل {n} أحرف على الأقل',
    maxLength: 'أدخل {n} أحرف على الأكثر',
    minValue: 'أدخل {n} أو أكثر',
    maxValue: 'أدخل {n} أو أقل',
    minSelections: 'اختر {n} خيارات على الأقل',
    maxSelections: 'اختر {n} خيارات على الأكثر',
    pattern: 'أدخل قيمة بالصيغة المطلوبة',
    fileRequired: 'يرجى إرفاق ملف',
    fileTooLarge: 'حجم الملف كبير جدًا',
    fileTypes: 'أنواع الملفات المسموح بها: ',
    sending: 'جارٍ الإرسال…',
    genericError: 'حدث خطأ ما. حاول مرة أخرى.',
    tooManyRequests: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.',
    fixErrors: 'يرجى مراجعة الحقول المظللة.',
    selectPlaceholder: 'اختر…',
    chooseFile: 'اختر ملفًا',
    noFileChosen: 'لم يتم اختيار ملف',
    next: 'التالي',
    back: 'السابق',
    stepOf: 'الخطوة {current} من {total}',
    notFoundTitle: 'النموذج غير متاح',
    notFoundMessage: 'هذا النموذج غير موجود أو لم يعد يستقبل ردودًا.',
  },
};
