// QR code kit. Owner: QR builder. Export QR_TOOLS (all kind: 'live'). Everything runs in the browser; nothing is uploaded.
import { registerIcons } from '../core.js';
import { mountGenerator } from './qr-gen.js';
import { mountScanner } from './qr-scan.js';

registerIcons({
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.3"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.3"/><path d="M14 14h3v3h-3z"/><path d="M20.5 14v3.5"/><path d="M17 20.5h3.5"/><path d="M14 20.5h.01"/>',
  'qr-wifi': '<path d="M2.5 9a15 15 0 0 1 19 0"/><path d="M5.8 12.5a10 10 0 0 1 12.4 0"/><path d="M9 16a5 5 0 0 1 6 0"/><path d="M12 19.5h.01"/>',
  'qr-contact': '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2a3.5 3.5 0 0 1 6.4 0"/><path d="M14.5 10h3.5M14.5 13.5h3.5"/>',
  'qr-mail': '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7.5 8 6 8-6"/>',
  'qr-scan': '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
});

const SHARED_STATIC = ['Are these static or dynamic codes?', 'Static. The link or text is stored directly in the pattern of the code, so it never expires, is never counted or tracked, and does not pass through our servers. The trade-off is that you cannot change a printed static code later. If the content changes, make a new code. Dynamic codes work differently: they point to a redirect service that can be edited and can count scans.'];
const SHARED_COMMERCIAL = ['Can I use the codes commercially?', 'Yes. Codes you make here are yours to use on packaging, print, signs and ads, with no fee and no credit to us. The QR code format is an open standard (ISO/IEC 18004), and its creator, Denso Wave, has said it does not enforce its patents on codes that follow the standard. "QR Code" is a registered trademark of Denso Wave, so use the name with care in your own branding.'];
const SHARED_PRINT = ['How big should I print it?', 'As a rule of thumb, make the code at least 2 cm (about 0.8 in) wide for scanning at arm\'s length, and add about 1 cm of width for every 10 cm of scanning distance. A code with more content has smaller squares, so print it larger. Always print a test copy and scan it with a few different phones before you print a whole batch.'];
const SCAN_ADVICE = ['How do I make sure the code scans?', 'Use a dark code on a light background with strong contrast. Keep the empty border around the code at 4 squares or more, avoid light-on-dark inverted colors, and keep the content short. The tool warns you about weak contrast, an inverted color scheme or a narrow border, and holds back the download until you confirm. Whatever the preview says, test the finished code on a phone before you print it.'];

const gen = (start) => ({ mount(container, ctx) { return mountGenerator(container, { start }); } });

export const QR_TOOLS = [
  {
    id: 'qr-code-generator', slug: 'qr-code-generator', name: 'QR Code Generator',
    blurb: 'Make QR codes for links, text, Wi-Fi, contacts, email, phone and SMS. Custom colors and logo.',
    keywords: 'qr code maker create generate link url text png svg logo colors',
    icon: 'qr', kind: 'live',
    seo: {
      title: 'Free QR Code Generator: Colors, Logo, PNG, SVG | Ecom Swift LLC',
      description: 'Make a free QR code for a link, text, Wi-Fi, contact, email, phone or SMS. Change colors, add a logo, download PNG or SVG. Nothing is uploaded.',
      h1: 'QR Code Generator',
      intro: 'Create a QR code for a link, text, Wi-Fi network, contact, email, phone number or text message. Choose colors and style, then download a sharp PNG or SVG. It all runs in your browser.',
      steps: ['Choose what the code should hold and fill in the details.', 'Pick colors, a style and a size. Add a logo if you want one.', 'Scan the preview with your phone, then download the PNG or SVG.'],
      faq: [
        ['Is anything uploaded or stored?', 'No. The code is made in your browser. What you type is not sent to us or anyone else, and nothing is saved when you close the page. There is no sign-up, no watermark and no limit on how many codes you make.'],
        SHARED_STATIC, SHARED_COMMERCIAL, SCAN_ADVICE, SHARED_PRINT,
        ['What does error correction do, and can I add a logo?', 'A QR code carries extra data so it can still be read when part of it is dirty, worn or covered. Level L restores about 7% of damage, M about 15%, Q about 25% and H about 30%. Higher levels make the code denser. When you add a center logo the tool sets level H and keeps the logo to about a fifth of the width so the code stays readable.'],
      ],
      related: ['wifi-qr-code-generator', 'vcard-qr-code-generator', 'email-qr-code-generator', 'qr-code-scanner'],
    },
    ...gen('url'),
  },
  {
    id: 'wifi-qr-code-generator', slug: 'wifi-qr-code-generator', name: 'Wi-Fi QR Code Generator',
    blurb: 'Let guests join your Wi-Fi by scanning a code, with no password typing.',
    keywords: 'wifi wi-fi qr code password network ssid guest join',
    icon: 'qr-wifi', kind: 'live',
    seo: {
      title: 'Free Wi-Fi QR Code Generator: Share Your Network | Ecom Swift LLC',
      description: 'Make a Wi-Fi QR code so guests join your network by scanning it. Supports WPA, WEP, open and hidden networks. Runs in your browser, nothing uploaded.',
      h1: 'Wi-Fi QR Code Generator',
      intro: 'Turn your network name and password into a QR code that guests can scan to join, with no typing. It runs in your browser, so your password is never sent anywhere.',
      steps: ['Enter your network name, choose the security type and type the password.', 'Pick a style and size, and check the preview scans with your phone.', 'Download the PNG or SVG and print it or show it on a screen.'],
      faq: [
        ['Is my Wi-Fi password sent anywhere?', 'No. The code is made in your browser and nothing is uploaded or stored. Keep in mind that the password is written into the code as plain text, so anyone who can scan the printed code can read it. Consider using it only for a guest network.'],
        ['Which security type should I choose?', 'Choose WPA / WPA2 / WPA3 for almost every home and office network. WEP is old and weak and is only for routers that still use it. Choose None only for an open network that has no password. If you are unsure, look at the Wi-Fi settings page of your router.'],
        ['Will every phone join from the code?', 'Current iPhone and Android cameras can usually read Wi-Fi codes and offer to join. The person is asked to confirm first. Some older phones need a scanner app, so test with the devices your guests are likely to use before you print.'],
        ['What if my network is hidden or has symbols in its name?', 'Tick the hidden network box if the name is not broadcast. Symbols such as semicolons, colons, commas, quotes and backslashes in the name or password are escaped for you, so they are read back correctly.'],
        ['What happens if I change the password later?', 'The code stops working for new guests, because it holds the old password. This is a static code with no link to our servers, so make and print a new one after any change.'],
        SCAN_ADVICE,
      ],
      related: ['qr-code-generator', 'vcard-qr-code-generator', 'email-qr-code-generator', 'qr-code-scanner'],
    },
    ...gen('wifi'),
  },
  {
    id: 'vcard-qr-code-generator', slug: 'vcard-qr-code-generator', name: 'Contact QR Code Generator (vCard)',
    blurb: 'Put your name, phone, email and address in a QR code that saves as a contact.',
    keywords: 'vcard qr code contact business card address book name phone email',
    icon: 'qr-contact', kind: 'live',
    seo: {
      title: 'Free vCard QR Code Generator for Contacts | Ecom Swift LLC',
      description: 'Make a contact QR code (vCard) with your name, phone, email, website and address. People scan it to save you to their phone. Runs in your browser.',
      h1: 'Contact QR Code Generator (vCard)',
      intro: 'Create a contact QR code in the vCard format. Add your name, work details, phone numbers, email, website and address, then download it for a business card or email signature.',
      steps: ['Fill in your name or organization and any details you want to share.', 'Pick a color, style and size, and scan the preview with your phone.', 'Download the PNG or SVG and add it to your card, signature or flyer.'],
      faq: [
        ['Are my contact details uploaded?', 'No. The code is made in your browser. Your details are not sent to us or stored, and they disappear when you close the page.'],
        ['What does the person see when they scan it?', 'Their phone shows your contact details and offers to save them, as long as the phone supports vCard codes, which current iPhones and Android phones usually do. They choose whether to save. Test with your own phone first.'],
        ['Which details can I include?', 'First and last name, organization, job title, a mobile and a work phone, email, website and a postal address. Only the fields you fill in are added. Photos and notes are not included, because they would make the code too dense to scan.'],
        ['Why is my code so busy and hard to scan?', 'Every extra detail adds squares. A short contact with a name, one phone number and an email makes a simple code that scans easily. If the code looks crowded, remove the address or the second number, or print it larger.'],
        SHARED_STATIC,
        SHARED_PRINT,
      ],
      related: ['qr-code-generator', 'wifi-qr-code-generator', 'email-qr-code-generator', 'qr-code-scanner'],
    },
    ...gen('vcard'),
  },
  {
    id: 'email-qr-code-generator', slug: 'email-qr-code-generator', name: 'Email QR Code Generator',
    blurb: 'Make a QR code that opens a new email with the address, subject and message filled in.',
    keywords: 'email qr code mailto subject body address message',
    icon: 'qr-mail', kind: 'live',
    seo: {
      title: 'Free Email QR Code Generator (mailto) | Ecom Swift LLC',
      description: 'Make a QR code that opens a new email with the address, subject and message already filled in. Download PNG or SVG. Runs in your browser, no sign-up.',
      h1: 'Email QR Code Generator',
      intro: 'Create a QR code that opens a new email to an address you choose, with the subject and message already filled in. Download it as a PNG or SVG. It all runs in your browser.',
      steps: ['Enter the email address, and a subject and message if you want them.', 'Pick a color, style and size, and scan the preview with your phone.', 'Download the PNG or SVG and use it in print or on screen.'],
      faq: [
        ['Does scanning send an email automatically?', 'No. Scanning opens a draft in the person\'s email app with the address, subject and message filled in. They read it and press send themselves.'],
        ['Can I add several recipients?', 'Yes. Separate the addresses with commas in the "Send to" box. Most email apps accept several recipients from a code like this.'],
        ['Are special characters and line breaks handled?', 'Yes. Spaces, accents, symbols and line breaks in the subject and message are encoded in the standard mailto format, so they appear as you typed them.'],
        ['Is my text uploaded?', 'No. The code is made in your browser. The address and message are not sent to us or stored.'],
        SHARED_STATIC,
        SCAN_ADVICE,
      ],
      related: ['qr-code-generator', 'wifi-qr-code-generator', 'vcard-qr-code-generator', 'qr-code-scanner'],
    },
    ...gen('email'),
  },
  {
    id: 'qr-code-scanner', slug: 'qr-code-scanner', name: 'QR Code Reader',
    blurb: 'Read a QR code from a picture, screenshot or camera and see what it holds before you open it.',
    keywords: 'qr code scanner reader decode scan image upload camera photo screenshot',
    icon: 'qr-scan', kind: 'live',
    seo: {
      title: 'Free QR Code Reader: Scan From an Image or Photo | Ecom Swift LLC',
      description: 'Read a QR code from a photo, screenshot or your camera and see its content first. Links are never opened for you. Runs in your browser, nothing uploaded.',
      h1: 'QR Code Reader',
      intro: 'Upload, drop or paste a picture of a QR code, or use your camera, and see what it holds. Links are shown as text first and never opened for you. Everything is read in your browser.',
      steps: ['Choose a picture, drop one here, paste an image or start the camera.', 'Read the decoded text and the details the tool found.', 'Copy what you need, or open a link only if you trust the address.'],
      faq: [
        ['Is my picture uploaded?', 'No. The picture is decoded on your device and is never sent to a server. The camera video stays on your device as well, and the camera stops as soon as a code is read.'],
        ['What kinds of codes can it explain?', 'It shows the raw text of any QR code, and recognizes web links, Wi-Fi networks, contact cards (vCard and MeCard), email, phone numbers and text messages, with the details laid out. Anything else is shown as plain text. It reads QR codes only, not other barcodes.'],
        ['Why does it not open links for me?', 'Anyone can put any address in a QR code, including fake sites that copy a bank or shop. The tool shows the full address as text first, with a warning, and only opens it if you press Open link.'],
        ['Why does it say no QR code was found?', 'The code may be too small, blurry, cut off or low in contrast. Crop the picture so the code fills most of it, use a sharper and brighter image, and keep all four edges visible. The tool also tries inverted codes and several sizes before it gives up.'],
        ['Does it work with the camera?', 'Yes, on devices and browsers that allow camera access. Your browser asks for permission first. If you decline, or no camera is available, you can still use a picture or screenshot.'],
        ['What if a picture has more than one code?', 'The tool shows the first code it finds. To read another, crop the picture to that code and try again.'],
      ],
      related: ['qr-code-generator', 'wifi-qr-code-generator', 'vcard-qr-code-generator', 'email-qr-code-generator'],
    },
    mount(container) { return mountScanner(container); },
  },
];
