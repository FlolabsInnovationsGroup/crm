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
  time: string;
  address: string;
  matrix: string;
  signatureRequired: string;
  clear: string;
  street: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  fileRequired: string;
  fileTooLarge: string;
  fileTypes: string;
  fileUnreadable: string;
  sending: string;
  genericError: string;
  connectionFailed: string;
  tooManyRequests: string;
  fixErrors: string;
  selectPlaceholder: string;
  chooseFile: string;
  noFileChosen: string;
  next: string;
  back: string;
  reviewTitle: string;
  reviewHint: string;
  edit: string;
  noAnswer: string;
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
    time: 'Enter a valid time',
    address: 'Enter the street, city and country',
    matrix: 'Answer every row',
    signatureRequired: 'Please sign',
    clear: 'Clear',
    street: 'Street address',
    city: 'City',
    region: 'State / region',
    postcode: 'Postal code',
    country: 'Country',
    fileRequired: 'Please attach a file',
    fileTooLarge: 'This file is too large',
    fileTypes: 'Allowed file types: ',
    fileUnreadable:
      'This file could not be opened. If it is in iCloud, OneDrive or an email, save it to your device first, then choose it again.',
    sending: 'Sending…',
    genericError: 'Something went wrong. Please try again.',
    connectionFailed:
      'Your application could not be sent. Check your internet connection and try again. If it keeps failing, open this page directly in Safari or Chrome, not inside another app.',
    tooManyRequests: 'Too many attempts. Please wait a minute and try again.',
    fixErrors: 'Please check the highlighted fields.',
    selectPlaceholder: 'Select…',
    chooseFile: 'Choose a file',
    noFileChosen: 'No file chosen',
    next: 'Next',
    back: 'Back',
    reviewTitle: 'Please review your submission.',
    reviewHint: 'Update any relevant information as needed.',
    edit: 'Edit',
    noAnswer: 'No answer',
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
    time: 'أدخل وقتًا صحيحًا',
    address: 'أدخل الشارع والمدينة والدولة',
    matrix: 'أجب عن كل الصفوف',
    signatureRequired: 'يرجى التوقيع',
    clear: 'مسح',
    street: 'عنوان الشارع',
    city: 'المدينة',
    region: 'المحافظة / الولاية',
    postcode: 'الرمز البريدي',
    country: 'الدولة',
    fileRequired: 'يرجى إرفاق ملف',
    fileTooLarge: 'حجم الملف كبير جدًا',
    fileTypes: 'أنواع الملفات المسموح بها: ',
    fileUnreadable:
      'تعذر فتح هذا الملف. إذا كان على iCloud أو OneDrive أو في رسالة بريد، احفظه على جهازك أولًا ثم اختره مرة أخرى.',
    sending: 'جارٍ الإرسال…',
    genericError: 'حدث خطأ ما. حاول مرة أخرى.',
    connectionFailed:
      'تعذر إرسال طلبك. تحقق من اتصالك بالإنترنت وحاول مرة أخرى. إذا تكرر ذلك، افتح هذه الصفحة مباشرة في Safari أو Chrome وليس داخل تطبيق آخر.',
    tooManyRequests: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.',
    fixErrors: 'يرجى مراجعة الحقول المظللة.',
    selectPlaceholder: 'اختر…',
    chooseFile: 'اختر ملفًا',
    noFileChosen: 'لم يتم اختيار ملف',
    next: 'التالي',
    back: 'السابق',
    reviewTitle: 'راجع إجاباتك قبل الإرسال.',
    reviewHint: 'عدّل أي معلومة تحتاج إلى تعديل.',
    edit: 'تعديل',
    noAnswer: 'لا توجد إجابة',
    stepOf: 'الخطوة {current} من {total}',
    notFoundTitle: 'النموذج غير متاح',
    notFoundMessage: 'هذا النموذج غير موجود أو لم يعد يستقبل ردودًا.',
  },
};
