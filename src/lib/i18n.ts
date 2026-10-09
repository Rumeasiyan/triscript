import type { FieldKey } from "./types";

export type Lang = "en" | "si" | "ta";

export const LANGS: { code: Lang; native: string; english: string }[] = [
  { code: "en", native: "English", english: "English" },
  { code: "si", native: "සිංහල", english: "Sinhala" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
];

export const DEFAULT_LANG: Lang = "en";

const en = {
  appName: "TRISCRIPT",
  tagline: "Turn a photo of a letter into filled-in fields, in Sinhala, Tamil and English.",
  skipToContent: "Skip to main content",
  language: "Language",
  nav: { home: "Home", demo: "Scan a letter", register: "Letter register", about: "About" },

  home: {
    heroEyebrow: "Sinhala · Tamil · English",
    heroTitle: "Scan a letter with your phone. See the details on your computer.",
    heroBody:
      "No typing and no app to install. Scan a code on your computer, photograph the paper with your phone, and the details fill in for you to check.",
    tryDemo: "Try the scan demo",
    tryRegister: "See it in a letter register",
    howTitle: "How it works",
    step1Title: "Scan the code",
    step1Body: "Open the page on your computer. Scan the code shown there with your phone camera.",
    step2Title: "Photograph the paper",
    step2Body: "Take a photo of the letter. Look at the picture and retake it if needed.",
    step3Title: "Check and save",
    step3Body: "The details appear on your computer. Check them, correct anything, then save.",
    langTitle: "Three languages",
    langBody:
      "Letters in Sinhala, Tamil and English, including letters that mix them. These screens are available in all three languages too.",
    privacyTitle: "Private by design",
    privacyBody:
      "The photo is used only to read the fields and is deleted when you save. The link between your phone and computer expires.",
    testNotice:
      'Only invented test letters are used in this project, marked \u201cTEST LETTER, NOT VALID\u201d.',
  },

  pair: {
    title: "Scan a letter",
    start: "Show the code",
    starting: "Preparing…",
    instruction: "Scan this code with your phone camera, then photograph the letter.",
    qrAlt: "QR code. Scan it with your phone to open the camera.",
    expiresIn: "Code expires in {time}",
    waiting: "Waiting for the photo from your phone…",
    linkLabel: "Or open this address on your phone",
    expired: "This code has expired.",
    newCode: "Show a new code",
    cancel: "Cancel",
    manual: "Type the details instead",
    networkHint:
      "Your phone must be able to reach this computer, for example on the same Wi-Fi.",
  },

  capture: {
    title: "Photograph the letter",
    intro:
      "Place the letter on a flat surface with good light. Keep all four corners in the picture.",
    take: "Take a photo",
    use: "Use this photo",
    retake: "Retake",
    previewAlt: "Preview of the photo you just took",
    checkPhoto: "Is the writing sharp and the whole page visible?",
    sending: "Sending to your computer…",
    retrying: "Connection is weak. Trying again ({n} of {max})…",
    sent: "Done. Look at your computer.",
    sentHint: "You can close this page. The link has been closed.",
    expiredTitle: "This link has expired",
    expiredBody: "Go back to your computer and show a new code.",
    notFound: "This link is not valid. Go back to your computer and show a new code.",
    error: "The photo could not be sent.",
    tryAgain: "Try again",
    checking: "Checking the link…",
  },

  review: {
    title: "Check the details",
    reading: "Reading the letter…",
    readingHint: "This takes a few moments.",
    photoAlt: "The photo of the letter",
    demoNotice:
      "Demo reader: these values are invented test data, not read from your photo.",
    intro:
      "Check every value against the paper. Correct anything that is wrong. Empty fields were left empty on purpose when the reader was not sure.",
    confidence: {
      high: "Sure",
      medium: "Check this",
      low: "Not sure",
      empty: "Left empty",
      edited: "Edited by you",
    },
    confidenceLabel: "How sure the reader is",
    percent: "{n} percent",
    confirmLabel: "I have checked these details against the letter",
    save: "Save details",
    saving: "Saving…",
    startOver: "Start over",
    saved: "Saved",
    savedBody: "The details were saved and the photo was deleted.",
    scanAnother: "Scan another letter",
    error: "The letter could not be read.",
    errorBody: "You can try again, or type the details yourself.",
    retry: "Try again",
    mustConfirm: "Tick the box to confirm you have checked the details.",
    languageOptions: { en: "English", si: "Sinhala", ta: "Tamil", mixed: "Mixed" },
  },

  fields: {
    subject: "Subject",
    myNumber: "My number",
    yourNumber: "Your number",
    date: "Date",
    from: "From",
    to: "To",
    signedBy: "Signed by",
    language: "Language of the letter",
    body: "Full text",
  } as Record<FieldKey, string>,

  register: {
    title: "Letter register",
    intro:
      "A second page that uses the same scan component. Add a letter by scanning it, then it appears in the list.",
    addLetter: "Add a letter by scanning",
    listTitle: "Registered letters",
    empty: "No letters registered yet.",
    columns: { date: "Date", subject: "Subject", from: "From", ref: "Reference" },
    clear: "Clear list",
  },

  footer: {
    built: "Built in the open by the Eastern Province IT Volunteer Programme, Sri Lanka.",
    status: "Status: starting. Open source.",
  },

  notFound: {
    title: "Page not found",
    body: "The page you are looking for does not exist or the link has changed.",
    home: "Go to home page",
  },

  about: {
    title: "About TRISCRIPT",
    tagline:
      "An open-source library that turns a phone photo of a letter or form into filled-in fields, in Sinhala, Tamil and English.",
    whyTitle: "Why",
    whyBody:
      "Government offices receive letters and paper forms every day. Someone reads each one and types its details by hand: the subject, reference numbers, the date, who sent it and who it is for. It is slow, it repeats work, and mistakes creep in — especially when the paper is in a language the person typing does not read. TRISCRIPT removes that typing.",
    nameTitle: "Why the name",
    nameBody:
      'The Rosetta Stone carries one text in three scripts, and it unlocked how to read them. TRISCRIPT (\u201cthree scripts\u201d) reads letters written in the three official languages of Sri Lanka, and turns them into information any system can use.',
    fieldsTitle: "What it reads from a letter",
    fieldsBody:
      "The first release reads these fields. Forms come next, with a description of each form's layout that any office can add.",
    fieldColName: "Field",
    fieldColExample: "Example",
    fieldRows: [
      { name: "Subject", example: "the heading of the letter" },
      { name: "My number / Your number", example: "the reference numbers" },
      { name: "Date", example: "the date written on the letter" },
      { name: "From", example: "the sender: person, post and office" },
      { name: "To", example: "the addressee" },
      { name: "Signed by", example: "the signatory and their post" },
      { name: "Language", example: "Sinhala, Tamil or English" },
      { name: "Body", example: "the full text, for search" },
    ],
    privacyTitle: "Privacy",
    privacyBody1:
      "Photos are used only to read the fields and are not kept after the person saves. The link between a phone and a computer expires after a few minutes.",
    privacyBody2:
      "Nothing is sent anywhere except between the person's own phone and computer and the system they are using.",
    testNotice:
      'Only invented test letters are used in development: marked \u201cTEST LETTER, NOT VALID\u201d, with reference numbers starting TEST/.',
    openTitle: "Built in the open",
    openBody:
      "TRISCRIPT is open source, built by the Eastern Province IT Volunteer Programme, Sri Lanka. Its first home is the Eastern Province's office letters system. Any other office, in any country, is welcome to use it.",
    githubLink: "View source on GitHub",
  },
};

export type Dict = typeof en;

const si: Dict = {
  appName: "TRISCRIPT",
  tagline: "ලිපියක ඡායාරූපයක් සිංහල, දෙමළ සහ ඉංග්‍රීසියෙන් පුරවන ලද ක්ෂේත්‍ර බවට පත් කරයි.",
  skipToContent: "ප්‍රධාන අන්තර්ගතයට යන්න",
  language: "භාෂාව",
  nav: { home: "මුල් පිටුව", demo: "ලිපියක් ස්කෑන් කරන්න", register: "ලිපි ලේඛනය", about: "ගැන" },

  home: {
    heroEyebrow: "සිංහල · தமிழ் · English",
    heroTitle: "ඔබේ දුරකථනයෙන් ලිපිය ස්කෑන් කරන්න. විස්තර පරිගණකයේ බලන්න.",
    heroBody:
      "ටයිප් කිරීමක් හෝ යෙදුමක් ස්ථාපනය කිරීමක් අවශ්‍ය නැත. පරිගණකයේ ඇති කේතය ස්කෑන් කර, දුරකථනයෙන් කඩදාසිය ඡායාරූප ගත කරන්න. විස්තර ඔබට පරීක්ෂා කිරීමට පිරී පෙනේ.",
    tryDemo: "ස්කෑන් කිරීමේ නිරූපණය අත්හදා බලන්න",
    tryRegister: "ලිපි ලේඛනයක් තුළ බලන්න",
    howTitle: "ක්‍රියා කරන ආකාරය",
    step1Title: "කේතය ස්කෑන් කරන්න",
    step1Body: "පරිගණකයේ පිටුව විවෘත කරන්න. එහි පෙන්වන කේතය ඔබේ දුරකථන කැමරාවෙන් ස්කෑන් කරන්න.",
    step2Title: "කඩදාසිය ඡායාරූප ගන්න",
    step2Body: "ලිපියේ ඡායාරූපයක් ගන්න. පින්තූරය බලා අවශ්‍ය නම් නැවත ගන්න.",
    step3Title: "පරීක්ෂා කර සුරකින්න",
    step3Body: "විස්තර ඔබේ පරිගණකයේ පෙන්වයි. ඒවා පරීක්ෂා කර, වැරදි නිවැරදි කර, සුරකින්න.",
    langTitle: "භාෂා තුනක්",
    langBody:
      "සිංහල, දෙමළ සහ ඉංග්‍රීසි ලිපි, භාෂා මිශ්‍ර ලිපි ද ඇතුළුව. මෙම තිර ද භාෂා තුනෙන්ම ලබා ගත හැක.",
    privacyTitle: "පෞද්ගලිකත්වය සඳහා නිර්මිතයි",
    privacyBody:
      "ඡායාරූපය භාවිත කරන්නේ ක්ෂේත්‍ර කියවීමට පමණි; ඔබ සුරකින විට එය මැකේ. ඔබේ දුරකථනය සහ පරිගණකය අතර සබැඳිය කල් ඉකුත් වේ.",
    testNotice:
      '\u0DB8\u0DB1\u0DCA \u0DC0\u0DCA\u200D\u0DBA\u0DCF\u0DB4\u0DC3\u0DB8\u0DCB\u0DC0\u0DAD\u0DCA \u0DB6\u0DC4\u0DCB\u0DC4\u0DCA\u0DAD\u0DB1\u0DCB \u201cTEST LETTER, NOT VALID\u201d \u0DBD\u0DDB\u0DC3\u0DCA \u0DC3\u0DBD\u0D9A\u0DD4\u0DAB\u0DD4 \u0D9A\u0DC5 \u0DC6\u0DCF\u0DAD\u0DDB \u0D9C\u0DCF\u0DD0\u0DB8\u0DD6 \u0DB4\u0DBB\u0DD3\u0D9A\u0DCA\u0DC2\u0DAB \u0DBD\u0DD2\u0DB4\u0DD2 \u0DB4\u0DB8\u0DAB\u0D9A\u0DCA.',
  },

  pair: {
    title: "ලිපියක් ස්කෑන් කරන්න",
    start: "කේතය පෙන්වන්න",
    starting: "සූදානම් කරමින්…",
    instruction: "මෙම කේතය ඔබේ දුරකථන කැමරාවෙන් ස්කෑන් කර, ලිපිය ඡායාරූප ගන්න.",
    qrAlt: "QR කේතය. කැමරාව විවෘත කිරීමට ඔබේ දුරකථනයෙන් එය ස්කෑන් කරන්න.",
    expiresIn: "කේතය කල් ඉකුත් වීමට {time}",
    waiting: "ඔබේ දුරකථනයෙන් ඡායාරූපය බලා සිටිමින්…",
    linkLabel: "නැතහොත් මෙම ලිපිනය දුරකථනයේ විවෘත කරන්න",
    expired: "මෙම කේතය කල් ඉකුත් වී ඇත.",
    newCode: "නව කේතයක් පෙන්වන්න",
    cancel: "අවලංගු කරන්න",
    manual: "ඒ වෙනුවට විස්තර ටයිප් කරන්න",
    networkHint:
      "ඔබේ දුරකථනයට මෙම පරිගණකය වෙත ළඟා විය හැකි විය යුතුය, උදාහරණයක් ලෙස එකම Wi-Fi මත.",
  },

  capture: {
    title: "ලිපිය ඡායාරූප ගන්න",
    intro:
      "ලිපිය හොඳ ආලෝකයක් ඇති පැතලි තලයක තබන්න. කොන් හතරම පින්තූරයේ ඇතුළත් කරන්න.",
    take: "ඡායාරූපයක් ගන්න",
    use: "මෙම ඡායාරූපය භාවිත කරන්න",
    retake: "නැවත ගන්න",
    previewAlt: "ඔබ දැන් ගත් ඡායාරූපයේ පෙරදසුන",
    checkPhoto: "අකුරු පැහැදිලිද, සම්පූර්ණ පිටුවම පෙනෙනවාද?",
    sending: "ඔබේ පරිගණකයට යවමින්…",
    retrying: "සම්බන්ධතාව දුර්වලයි. නැවත උත්සාහ කරමින් ({n} / {max})…",
    sent: "අවසන්. ඔබේ පරිගණකය බලන්න.",
    sentHint: "ඔබට මෙම පිටුව වසා දැමිය හැක. සබැඳිය වසා ඇත.",
    expiredTitle: "මෙම සබැඳිය කල් ඉකුත් වී ඇත",
    expiredBody: "ඔබේ පරිගණකය වෙත ගොස් නව කේතයක් පෙන්වන්න.",
    notFound: "මෙම සබැඳිය වලංගු නැත. ඔබේ පරිගණකය වෙත ගොස් නව කේතයක් පෙන්වන්න.",
    error: "ඡායාරූපය යැවීමට නොහැකි විය.",
    tryAgain: "නැවත උත්සාහ කරන්න",
    checking: "සබැඳිය පරීක්ෂා කරමින්…",
  },

  review: {
    title: "විස්තර පරීක්ෂා කරන්න",
    reading: "ලිපිය කියවමින්…",
    readingHint: "මෙයට ටික වේලාවක් ගත වේ.",
    photoAlt: "ලිපියේ ඡායාරූපය",
    demoNotice:
      "නිරූපණ කියවනය: මෙම අගයන් ගොඩනැගූ පරීක්ෂණ දත්ත වන අතර ඔබේ ඡායාරූපයෙන් කියවා නැත.",
    intro:
      "සෑම අගයක්ම කඩදාසියට සසඳා පරීක්ෂා කරන්න. වැරදි ඒවා නිවැරදි කරන්න. කියවනයට විශ්වාස නොතිබූ තැන්වල ක්ෂේත්‍ර හිතාමතාම හිස්ව තබා ඇත.",
    confidence: {
      high: "විශ්වාසයි",
      medium: "පරීක්ෂා කරන්න",
      low: "විශ්වාස නැත",
      empty: "හිස්ව තැබුවා",
      edited: "ඔබ සංස්කරණය කළා",
    },
    confidenceLabel: "කියවනයේ විශ්වාසය",
    percent: "සියයට {n}",
    confirmLabel: "මම මෙම විස්තර ලිපියට සසඳා පරීක්ෂා කළෙමි",
    save: "විස්තර සුරකින්න",
    saving: "සුරකිමින්…",
    startOver: "මුල සිට අරඹන්න",
    saved: "සුරකින ලදී",
    savedBody: "විස්තර සුරකින ලද අතර ඡායාරූපය මකා දමන ලදී.",
    scanAnother: "තවත් ලිපියක් ස්කෑන් කරන්න",
    error: "ලිපිය කියවීමට නොහැකි විය.",
    errorBody: "ඔබට නැවත උත්සාහ කළ හැක, නැතහොත් විස්තර ඔබම ටයිප් කළ හැක.",
    retry: "නැවත උත්සාහ කරන්න",
    mustConfirm: "විස්තර පරීක්ෂා කළ බව තහවුරු කිරීමට කොටුව සලකුණු කරන්න.",
    languageOptions: { en: "ඉංග්‍රීසි", si: "සිංහල", ta: "දෙමළ", mixed: "මිශ්‍ර" },
  },

  fields: {
    subject: "විෂය",
    myNumber: "මගේ අංකය",
    yourNumber: "ඔබේ අංකය",
    date: "දිනය",
    from: "එවූ අය",
    to: "ලබන්නා",
    signedBy: "අත්සන් කළේ",
    language: "ලිපියේ භාෂාව",
    body: "සම්පූර්ණ පාඨය",
  } as Record<FieldKey, string>,

  register: {
    title: "ලිපි ලේඛනය",
    intro:
      "එම ස්කෑන් කිරීමේ සංරචකයම භාවිත කරන දෙවන පිටුවකි. ලිපියක් ස්කෑන් කර එක් කරන්න, එවිට එය ලැයිස්තුවේ පෙනේ.",
    addLetter: "ස්කෑන් කර ලිපියක් එක් කරන්න",
    listTitle: "ලේඛනගත ලිපි",
    empty: "තවමත් ලිපි ලේඛනගත කර නැත.",
    columns: { date: "දිනය", subject: "විෂය", from: "එවූ අය", ref: "යොමුව" },
    clear: "ලැයිස්තුව මකන්න",
  },

  footer: {
    built: "ශ්‍රී ලංකාවේ නැගෙනහිර පළාතේ තොරතුරු තාක්ෂණ ස්වේච්ඡා සේවා වැඩසටහන විසින් විවෘතව ගොඩනඟන ලදී.",
    status: "තත්ත්වය: ආරම්භක අවධිය. විවෘත මූලාශ්‍ර.",
  },

  notFound: {
    title: "පිටුව හමු නොවිණි",
    body: "ඔබ සොයන පිටුව නොමැත, නැතහොත් සබැඳිය වෙනස් වී ඇත.",
    home: "මුල් පිටුවට යන්න",
  },

  about: {
    title: "TRISCRIPT ගැන",
    tagline:
      "ලිපියක හෝ පෝරමයක ඡායාරූපයක් සිංහල, දෙමළ සහ ඉංග්‍රීසි භාෂාවලින් පිරවූ ක්ෂේත්‍ර බවට පත් කරන විවෘත-මූලාශ්‍ර පුස්තකාලයකි.",
    whyTitle: "මන්ද",
    whyBody:
      "රජයේ කාර්යාල දිනපතා ලිපි හා කඩදාසි පෝරම ලබා ගනී. කෙනෙකු ඒ සෑම එකක්ම කියවා විස්තර අතින් ටයිප් කරයි: විෂය, යොමු අංකය, දිනය, යවූ තැනැත්තා සහ ලබන්නා. එය මන්දගාමී, නැවත නැවත කෙරෙන කාර්යයකි, ෙදොස් ද ඇති ෙව්. TRISCRIPT ඒ ටයිප් කිරීම ඉවත් කරයි.",
    nameTitle: "නමේ හේතුව",
    nameBody:
      'රොසෙට්ටා ශිලාව ෙලිඛිත පදාර්ථය ෙලඛන රූප තුනකින් ෙගෙනන අතර ඒවා කියවීමට යතුර විවෘත කළේය. TRISCRIPT (\u201cෙලඛන රූප තුනක්\u201d) ශ්‍රී ලංකාෙව් භාෂා තුනෙකන් ලිවූ ලිපි කියවා ෙකෙනකුටත් භාවිත කළ හැකි ෙතාරතුරු බවට ෙපරළයි.',
    fieldsTitle: "ලිපියෙන් කියවන ක්ෂේත්‍ර",
    fieldsBody:
      "පළමු නිකුතුව මෙම ක්ෂේත්‍ර කියවයි. ඊළඟට ෙපෝරම – ඕනෑම කාර්යාලයකට ෙදවිය හැකි ෙලෝ-ඇවුත් සැකිල්ලකිනි.",
    fieldColName: "ක්ෂේත්‍රය",
    fieldColExample: "උදාහරණය",
    fieldRows: [
      { name: "විෂය", example: "ලිපියේ ශීර්ෂය" },
      { name: "මගේ / ඔබේ අංකය", example: "යොමු අංකය" },
      { name: "දිනය", example: "ලිපියේ ඇති දිනය" },
      { name: "එවූ අය", example: "යෝජකයා: නම, තනතුර, කාර්යාලය" },
      { name: "ලබන්නා", example: "ලිපිය ලැබෙන්නා" },
      { name: "අත්සන් කළේ", example: "අත්සන් කළ අය හා ඔවුන්ගේ තනතුර" },
      { name: "භාෂාව", example: "සිංහල, දෙමළ හෝ ඉංග්‍රීසි" },
      { name: "සම්පූර්ණ පාඨය", example: "සෙවීම සඳහා සම්පූර්ණ පෙළ" },
    ],
    privacyTitle: "පෞද්ගලිකත්වය",
    privacyBody1:
      "ඡායාරූප ක්ෂේත්‍ර කියවීමට පමණක් භාවිත කරන අතර ඔබ සුරකින පසු ඒවා රඳවා නොගනී. දුරකථනය හා පරිගණකය අතර සබැඳිය මිනිත්තු කිහිපයකින් කල් ඉකුත් වේ.",
    privacyBody2:
      "ඔබේ දුරකථනය, පරිගණකය සහ ඔබ භාවිත කරන පද්ධතිය අතර හැර කිසිත් කිසිතැනකට යොමු නොකෙරේ.",
    testNotice:
      'සංවර්ධනයේදී ගොඩනැගූ පරීක්ෂණ ලිපි පමණක් භාවිත කෙරේ: \u201cTEST LETTER, NOT VALID\u201d ලෙස සලකුණු කළ, TEST/ ෙදිය ෙරෝ ෙලකු ඇරෙඹෙන ෙලකු.',
    openTitle: "විවෘතව ගොඩනඟන ලදී",
    openBody:
      "TRISCRIPT විවෘත-මූලාශ්‍ර වන අතර, ශ්‍රී ලංකාවේ නැගෙනහිර පළාතේ IT ස්වේච්ඡා සේවා වැඩසටහන විසින් ගොඩනඟන ලදී. ඕනෑම රටක ඕනෑම කාර්යාලයකට එය භාවිත කළ හැකිය.",
    githubLink: "GitHub හි ප්‍රභව කේතය බලන්න",
  },
};

const ta: Dict = {
  appName: "TRISCRIPT",
  tagline: "கடிதத்தின் புகைப்படத்தை சிங்களம், தமிழ், ஆங்கிலத்தில் நிரப்பப்பட்ட புலங்களாக மாற்றுகிறது.",
  skipToContent: "முதன்மை உள்ளடக்கத்திற்குச் செல்லவும்",
  language: "மொழி",
  nav: { home: "முகப்பு", demo: "கடிதத்தை ஸ்கேன் செய்", register: "கடிதப் பதிவேடு", about: "பற்றி" },

  home: {
    heroEyebrow: "சிங்களம் · தமிழ் · ஆங்கிலம்",
    heroTitle: "உங்கள் தொலைபேசியால் கடிதத்தை ஸ்கேன் செய்யுங்கள். விவரங்களை கணினியில் பாருங்கள்.",
    heroBody:
      "தட்டச்சு தேவையில்லை, செயலியை நிறுவவும் தேவையில்லை. கணினியில் உள்ள குறியீட்டை ஸ்கேன் செய்து, தொலைபேசியால் தாளைப் புகைப்படம் எடுங்கள். விவரங்கள் நீங்கள் சரிபார்க்க நிரப்பப்படும்.",
    tryDemo: "ஸ்கேன் செய்து பாருங்கள்",
    tryRegister: "கடிதப் பதிவேட்டில் பாருங்கள்",
    howTitle: "இது எவ்வாறு செயல்படுகிறது",
    step1Title: "குறியீட்டை ஸ்கேன் செய்யுங்கள்",
    step1Body: "கணினியில் பக்கத்தைத் திறக்கவும். அங்கே காட்டப்படும் குறியீட்டை தொலைபேசிக் கேமராவால் ஸ்கேன் செய்யுங்கள்.",
    step2Title: "தாளைப் புகைப்படம் எடுங்கள்",
    step2Body: "கடிதத்தைப் புகைப்படம் எடுங்கள். படத்தைப் பார்த்து, தேவைப்பட்டால் மீண்டும் எடுங்கள்.",
    step3Title: "சரிபார்த்துச் சேமியுங்கள்",
    step3Body: "விவரங்கள் கணினியில் தோன்றும். அவற்றைச் சரிபார்த்து, தவறுகளைத் திருத்தி, சேமியுங்கள்.",
    langTitle: "மூன்று மொழிகள்",
    langBody:
      "சிங்களம், தமிழ், ஆங்கிலக் கடிதங்கள், மொழிகள் கலந்த கடிதங்கள் உட்பட. இந்தத் திரைகளும் மூன்று மொழிகளிலும் உள்ளன.",
    privacyTitle: "தனியுரிமைக்காக வடிவமைக்கப்பட்டது",
    privacyBody:
      "புகைப்படம் புலங்களை வாசிக்க மட்டுமே பயன்படுத்தப்படும்; நீங்கள் சேமிக்கும்போது அது நீக்கப்படும். தொலைபேசிக்கும் கணினிக்கும் இடையிலான இணைப்பு காலாவதியாகும்.",
    testNotice:
      '\u0B87\u0BA8\u0BCD\u0BA4\u0BA4\u0BCD \u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BB2\u0BCD \u201cTEST LETTER, NOT VALID\u201d \u0B8E\u0BA9\u0B95\u0BCD \u0B95\u0BC1\u0BB1\u0BBF\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BCD\u0B9F\u0BC1, \u0B95\u0BB1\u0BCD\u0BAA\u0BA9\u0BC8\u0B9A\u0BCD \u0B9A\u0BCB\u0BA4\u0BA9\u0BC8\u0B95\u0BCD \u0B95\u0B9F\u0BBF\u0BA4\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0B9F\u0BCD\u0B9F\u0BC1\u0BAE\u0BC7 \u0BAA\u0BAF\u0BA9\u0BCD\u0BAA\u0B9F\u0BC1\u0BA4\u0BCD\u0BA4\u0BAA\u0BCD\u0BAA\u0B9F\u0BC1\u0B95\u0BBF\u0BA9\u0BCD\u0BB1\u0BA9.',
  },

  pair: {
    title: "கடிதத்தை ஸ்கேன் செய்யுங்கள்",
    start: "குறியீட்டைக் காட்டு",
    starting: "தயாராகிறது…",
    instruction: "இந்தக் குறியீட்டை தொலைபேசிக் கேமராவால் ஸ்கேன் செய்து, கடிதத்தைப் புகைப்படம் எடுங்கள்.",
    qrAlt: "QR குறியீடு. கேமராவைத் திறக்க தொலைபேசியால் இதை ஸ்கேன் செய்யுங்கள்.",
    expiresIn: "குறியீடு காலாவதியாக {time}",
    waiting: "தொலைபேசியிலிருந்து புகைப்படத்திற்காகக் காத்திருக்கிறது…",
    linkLabel: "அல்லது இந்த முகவரியை தொலைபேசியில் திறக்கவும்",
    expired: "இந்தக் குறியீடு காலாவதியாகிவிட்டது.",
    newCode: "புதிய குறியீட்டைக் காட்டு",
    cancel: "ரத்து செய்",
    manual: "அதற்குப் பதிலாக விவரங்களைத் தட்டச்சு செய்யுங்கள்",
    networkHint:
      "உங்கள் தொலைபேசி இந்தக் கணினியை அடைய முடிய வேண்டும், எடுத்துக்காட்டாக அதே Wi-Fi இல்.",
  },

  capture: {
    title: "கடிதத்தைப் புகைப்படம் எடுங்கள்",
    intro:
      "கடிதத்தை நல்ல வெளிச்சமுள்ள சமதளத்தில் வையுங்கள். நான்கு மூலைகளும் படத்தில் இருக்கட்டும்.",
    take: "புகைப்படம் எடு",
    use: "இந்தப் புகைப்படத்தைப் பயன்படுத்து",
    retake: "மீண்டும் எடு",
    previewAlt: "நீங்கள் இப்போது எடுத்த புகைப்படத்தின் முன்னோட்டம்",
    checkPhoto: "எழுத்துகள் தெளிவாக உள்ளனவா, முழுப் பக்கமும் தெரிகிறதா?",
    sending: "உங்கள் கணினிக்கு அனுப்புகிறது…",
    retrying: "இணைப்பு பலவீனமாக உள்ளது. மீண்டும் முயல்கிறது ({n} / {max})…",
    sent: "முடிந்தது. உங்கள் கணினியைப் பாருங்கள்.",
    sentHint: "இந்தப் பக்கத்தை மூடலாம். இணைப்பு மூடப்பட்டது.",
    expiredTitle: "இந்த இணைப்பு காலாவதியாகிவிட்டது",
    expiredBody: "கணினிக்குச் சென்று புதிய குறியீட்டைக் காட்டுங்கள்.",
    notFound: "இந்த இணைப்பு செல்லாது. கணினிக்குச் சென்று புதிய குறியீட்டைக் காட்டுங்கள்.",
    error: "புகைப்படத்தை அனுப்ப முடியவில்லை.",
    tryAgain: "மீண்டும் முயலுங்கள்",
    checking: "இணைப்பைச் சரிபார்க்கிறது…",
  },

  review: {
    title: "விவரங்களைச் சரிபாருங்கள்",
    reading: "கடிதத்தை வாசிக்கிறது…",
    readingHint: "இதற்குச் சில கணங்கள் ஆகும்.",
    photoAlt: "கடிதத்தின் புகைப்படம்",
    demoNotice:
      "டெமோ வாசிப்பான்: இந்த மதிப்புகள் கற்பனைச் சோதனைத் தரவு; உங்கள் புகைப்படத்திலிருந்து வாசிக்கப்பட்டவை அல்ல.",
    intro:
      "ஒவ்வொரு மதிப்பையும் தாளுடன் ஒப்பிட்டுச் சரிபாருங்கள். தவறானவற்றைத் திருத்துங்கள். வாசிப்பானுக்கு உறுதி இல்லாதபோது புலங்கள் வேண்டுமென்றே காலியாக விடப்பட்டுள்ளன.",
    confidence: {
      high: "உறுதி",
      medium: "சரிபாருங்கள்",
      low: "உறுதியில்லை",
      empty: "காலியாக விடப்பட்டது",
      edited: "நீங்கள் திருத்தியது",
    },
    confidenceLabel: "வாசிப்பானின் உறுதி",
    percent: "{n} சதவீதம்",
    confirmLabel: "இந்த விவரங்களைக் கடிதத்துடன் ஒப்பிட்டுச் சரிபார்த்தேன்",
    save: "விவரங்களைச் சேமி",
    saving: "சேமிக்கிறது…",
    startOver: "மீண்டும் தொடங்கு",
    saved: "சேமிக்கப்பட்டது",
    savedBody: "விவரங்கள் சேமிக்கப்பட்டன, புகைப்படம் நீக்கப்பட்டது.",
    scanAnother: "மற்றொரு கடிதத்தை ஸ்கேன் செய்",
    error: "கடிதத்தை வாசிக்க முடியவில்லை.",
    errorBody: "மீண்டும் முயலலாம், அல்லது விவரங்களை நீங்களே தட்டச்சு செய்யலாம்.",
    retry: "மீண்டும் முயலுங்கள்",
    mustConfirm: "விவரங்களைச் சரிபார்த்ததை உறுதிப்படுத்த பெட்டியைத் தேர்ந்தெடுக்கவும்.",
    languageOptions: { en: "ஆங்கிலம்", si: "சிங்களம்", ta: "தமிழ்", mixed: "கலப்பு" },
  },

  fields: {
    subject: "பொருள்",
    myNumber: "என் எண்",
    yourNumber: "உங்கள் எண்",
    date: "தேதி",
    from: "அனுப்புநர்",
    to: "பெறுநர்",
    signedBy: "கையொப்பமிட்டவர்",
    language: "கடிதத்தின் மொழி",
    body: "முழு உரை",
  } as Record<FieldKey, string>,

  register: {
    title: "கடிதப் பதிவேடு",
    intro:
      "அதே ஸ்கேன் கூறைப் பயன்படுத்தும் இரண்டாவது பக்கம். கடிதத்தை ஸ்கேன் செய்து சேர்த்தால் அது பட்டியலில் தோன்றும்.",
    addLetter: "ஸ்கேன் செய்து கடிதத்தைச் சேர்",
    listTitle: "பதிவு செய்யப்பட்ட கடிதங்கள்",
    empty: "இன்னும் கடிதங்கள் பதிவு செய்யப்படவில்லை.",
    columns: { date: "தேதி", subject: "பொருள்", from: "அனுப்புநர்", ref: "குறிப்பு" },
    clear: "பட்டியலை அழி",
  },

  footer: {
    built: "இலங்கையின் கிழக்கு மாகாண தகவல் தொழில்நுட்ப தன்னார்வத் திட்டத்தால் வெளிப்படையாக உருவாக்கப்படுகிறது.",
    status: "நிலை: தொடக்கம். திறந்த மூலம்.",
  },

  notFound: {
    title: "பக்கம் கிடைக்கவில்லை",
    body: "நீங்கள் தேடும் பக்கம் இல்லை அல்லது இணைப்பு மாறிவிட்டது.",
    home: "முகப்புக்குச் செல்லவும்",
  },

  about: {
    title: "TRISCRIPT பற்றி",
    tagline:
      "கடிதம் அல்லது படிவத்தின் புகைப்படத்தை சிங்களம், தமிழ், ஆங்கிலத்தில் நிரப்பப்பட்ட புலங்களாக மாற்றும் திறந்த மூல நூலகம்.",
    whyTitle: "ஏன்",
    whyBody:
      "அரசு அலுவலகங்கள் தினந்தோறும் கடிதங்களும் தாள் படிவங்களும் பெறுகின்றன. ஒருவர் ஒவ்வொன்றையும் படித்து விவரங்களை கைமுறையாக தட்டச்சு செய்கிறார்: பொருள், குறிப்பு எண்கள், தேதி, அனுப்பியவர் யார், பெறுநர் யார். இது மெதுவாகவும், திரும்பத் திரும்பவும் செய்யும் பணியாகவும், தவறுகள் நுழையும் வகையிலும் உள்ளது. TRISCRIPT அந்த தட்டச்சை நீக்குகிறது.",
    nameTitle: "பெயரின் காரணம்",
    nameBody:
      'ரோசெட்டா கல் ஒரே உரையை மூன்று எழுத்துமுறைகளில் கொண்டிருந்தது, அது அவற்றை வாசிக்கும் திறவுகோலை அனைவருக்கும் வழங்கியது. TRISCRIPT (\u201cமூன்று எழுத்துமுறைகள்\u201d) இலங்கையின் மூன்று அதிகாரப்பூர்வ மொழிகளில் எழுதப்பட்ட கடிதங்களை வாசித்து, எந்த அமைப்பும் பயன்படுத்தக்கூடிய தகவலாக மாற்றுகிறது.',
    fieldsTitle: "கடிதத்திலிருந்து வாசிக்கப்படும் புலங்கள்",
    fieldsBody:
      "முதல் வெளியீடு இந்தப் புலங்களை வாசிக்கிறது. அடுத்து படிவங்கள் — எந்த அலுவலகமும் சேர்க்கக்கூடிய தளவமைப்பு விளக்கத்துடன்.",
    fieldColName: "புலம்",
    fieldColExample: "எடுத்துக்காட்டு",
    fieldRows: [
      { name: "பொருள்", example: "கடிதத்தின் தலைப்பு" },
      { name: "என் / உங்கள் எண்", example: "குறிப்பு எண்கள்" },
      { name: "தேதி", example: "கடிதத்தில் உள்ள தேதி" },
      { name: "அனுப்புநர்", example: "நபர், பதவி, அலுவலகம்" },
      { name: "பெறுநர்", example: "கடிதத்தை பெறுபவர்" },
      { name: "கையொப்பமிட்டவர்", example: "கையொப்பமிட்டவரும் அவர் பதவியும்" },
      { name: "மொழி", example: "சிங்களம், தமிழ் அல்லது ஆங்கிலம்" },
      { name: "முழு உரை", example: "தேடலுக்கான முழு உரை" },
    ],
    privacyTitle: "தனியுரிமை",
    privacyBody1:
      "புகைப்படங்கள் புலங்களை வாசிக்க மட்டுமே பயன்படுத்தப்படும்; நீங்கள் சேமிக்கும்போது அவை வைக்கப்படமாட்டா. தொலைபேசிக்கும் கணினிக்கும் இடையிலான இணைப்பு சில நிமிடங்களில் காலாவதியாகும்.",
    privacyBody2:
      "உங்கள் சொந்த தொலைபேசி, கணினி மற்றும் நீங்கள் பயன்படுத்தும் அமைப்புக்கு இடையில் தவிர வேறு எங்கும் எதுவும் அனுப்பப்படாது.",
    testNotice:
      'மேம்பாட்டில் கற்பனைச் சோதனைக் கடிதங்கள் மட்டுமே பயன்படுத்தப்படுகின்றன: \u201cTEST LETTER, NOT VALID\u201d எனக் குறிக்கப்பட்டு, TEST/ எனத் தொடங்கும் குறிப்பு எண்களுடன்.',
    openTitle: "வெளிப்படையாக உருவாக்கப்பட்டது",
    openBody:
      "TRISCRIPT திறந்த மூலமாக உள்ளது, இலங்கையின் கிழக்கு மாகாண IT தன்னார்வத் திட்டத்தால் உருவாக்கப்பட்டது. எந்த நாட்டிலுள்ள எந்த அலுவலகமும் இதைப் பயன்படுத்தலாம்.",
    githubLink: "GitHub இல் மூலக் குறியீட்டைக் காணுங்கள்",
  },
};

export const DICTS: Record<Lang, Dict> = { en, si, ta };

export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "si" || value === "ta";
}


