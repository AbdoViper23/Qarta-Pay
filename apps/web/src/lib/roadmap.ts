/**
 * Product roadmap shown on the landing page and on /roadmap. Phase 1 is what ships today;
 * later phases are plans with target dates, and the page says so.
 */
export type PhaseStatus = 'live' | 'next' | 'planned';

export interface Phase {
  number: string;
  name: string;
  when: string;
  status: PhaseStatus;
  summary: string;
  items: { title: string; text: string }[];
}

export const PHASES: Phase[] = [
  {
    number: '01',
    name: 'Launch',
    when: 'Live now',
    status: 'live',
    summary: 'Spend QIE and QUSDC on real products, with every payment escrowed on QIE Mainnet.',
    items: [
      { title: 'Mobile airtime', text: 'Top up prepaid phones in countries around the world.' },
      {
        title: 'Gift cards',
        text: 'Digital gift cards; the code is shown after a wallet signature.',
      },
      {
        title: 'Escrow and refunds',
        text: 'Paid, delivered, then released. Refunded automatically if delivery fails, and reclaimable by you after 2 hours.',
      },
      {
        title: 'QIE-native pricing',
        text: 'QIE payments are checked on-chain against the QIE oracle and cross-checked with QIEDex.',
      },
      { title: 'QIE Wallet and QIE ID', text: 'Connect with QIE Wallet and see your .qie name.' },
    ],
  },
  {
    number: '02',
    name: 'Everyday spending',
    when: 'Q1 2027',
    status: 'next',
    summary: 'More of what people buy every month, and sending by name instead of by number.',
    items: [
      { title: 'Data bundles', text: 'Mobile data plans next to airtime.' },
      {
        title: 'Send to a .qie name',
        text: 'Gift airtime or a gift card to name.qie instead of a phone number or an address.',
      },
      {
        title: 'Cashback in QIE',
        text: 'Part of the fee back to .qie name holders and QIE Pass verified users.',
      },
      { title: 'Telegram receipts', text: 'Order updates and receipts sent to Telegram.' },
      { title: 'Arabic interface', text: 'The whole store in Arabic, then more languages.' },
    ],
  },
  {
    number: '03',
    name: 'Bills and automation',
    when: 'Q2 2027',
    status: 'planned',
    summary: 'Pay the monthly bills in crypto, and stop thinking about top-ups.',
    items: [
      {
        title: 'Utility bill payments',
        text: 'Electricity, TV, internet and water bills, in the countries where our supplier serves them.',
      },
      {
        title: 'Auto top-up',
        text: 'Recurring top-ups with a spending cap you set and can cancel at any time.',
      },
      { title: 'QIE Pass verified accounts', text: 'Higher limits for verified users.' },
      { title: 'Telegram Mini App', text: 'Buy without leaving Telegram.' },
    ],
  },
  {
    number: '04',
    name: 'Platform',
    when: 'H2 2027',
    status: 'planned',
    summary: 'Qarta Pay as the spending layer other QIE products build on.',
    items: [
      {
        title: 'Qarta Checkout for QIE apps',
        text: 'An API and widget so any QIE app can sell top-ups, gift cards and bills, and earn a share of the fee.',
      },
      {
        title: 'Rewards and bulk payouts',
        text: 'Teams and communities send airtime or gift cards to many people at once, funded in QUSDC.',
      },
    ],
  },
];

export const STATUS_LABEL: Record<PhaseStatus, string> = {
  live: 'Live',
  next: 'Next',
  planned: 'Planned',
};
