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
  fileRequired: string;
  fileTooLarge: string;
  fileTypes: string;
  sending: string;
  genericError: string;
  tooManyRequests: string;
  fixErrors: string;
  selectPlaceholder: string;
  notFoundTitle: string;
  notFoundMessage: string;
};

// The English texts double as keys: server validation errors are matched
// against them so the page can show them in the form's language.
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
    fileRequired: 'Please attach a file',
    fileTooLarge: 'This file is too large',
    fileTypes: 'Allowed file types: ',
    sending: 'Sending…',
    genericError: 'Something went wrong. Please try again.',
    tooManyRequests: 'Too many attempts. Please wait a minute and try again.',
    fixErrors: 'Please check the highlighted fields.',
    selectPlaceholder: 'Select…',
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
    fileRequired: 'يرجى إرفاق ملف',
    fileTooLarge: 'حجم الملف كبير جدًا',
    fileTypes: 'أنواع الملفات المسموح بها: ',
    sending: 'جارٍ الإرسال…',
    genericError: 'حدث خطأ ما. حاول مرة أخرى.',
    tooManyRequests: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.',
    fixErrors: 'يرجى مراجعة الحقول المظللة.',
    selectPlaceholder: 'اختر…',
    notFoundTitle: 'النموذج غير متاح',
    notFoundMessage: 'هذا النموذج غير موجود أو لم يعد يستقبل ردودًا.',
  },
};
