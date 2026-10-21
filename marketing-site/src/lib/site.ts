/**
 * Static site-wide data: navigation, contact details and link groups.
 * Kept out of components so the footer/header markup stays declarative.
 *
 * Outbound URLs point at the real destinations listed on levoy.co; the
 * section anchors are internal to this single-route page.
 */

export const site = {
  name: "Callio",
  wordmark: "Callio®",
  tagline: "Telecalling analytics, built on the SIM.",
  appUrl: "https://web.levoy.co/signup",
  partnerLoginUrl: "https://partner.levoy.co",
  demoUrl: "https://levoy.co/schedule-demo/",
  careersUrl: "https://levoy.co/career/",
  helpUrl: "https://help.levoy.co",
  blogUrl: "https://levoy.co/blog/",
  partnerUrl: "https://levoy.co/become-levoy-partner/",
  playUrl: "https://play.google.com/store",
  contact: {
    email: "hello@levoy.co",
    phone: "+91 940 874 7666",
    phoneHref: "tel:+919408747666",
    addressLines: [
      "208 – Elite, Near Shapath Hexa",
      "Ahmedabad 380060, Gujarat",
      "India",
    ],
  },
  legal: {
    company: "LogiMinds Technolab LLP",
    year: 2026,
    links: {
      terms: "https://levoy.co/terms-of-services/",
      privacy: "https://levoy.co/privacy-policy/",
      partnerPolicy: "https://levoy.co/partner-policy/",
      refund: "https://levoy.co/refund-policy/",
    },
  },
} as const;

type NavLink = { label: string; href: string; external?: boolean };

export const navLinks: readonly NavLink[] = [
  { label: "Home", href: "#top" },
  { label: "Features", href: "#features" },
  { label: "Why Callio", href: "#why-levoy" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Contact Us", href: "#contact" },
  { label: "Career", href: site.careersUrl, external: true },
  { label: "Help Centre", href: site.helpUrl, external: true },
  { label: "Blog", href: site.blogUrl, external: true },
  { label: "Become a Partner", href: site.partnerUrl, external: true },
  { label: "Partner Login", href: site.partnerLoginUrl, external: true },
];

export const footerColumns: readonly {
  title: string;
  links: readonly NavLink[];
}[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Why Callio", href: "#why-levoy" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Partner Login", href: site.partnerLoginUrl, external: true },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Contact Us", href: "#contact" },
      { label: "Career", href: site.careersUrl, external: true },
      { label: "Help Centre", href: site.helpUrl, external: true },
      { label: "Blog", href: site.blogUrl, external: true },
      { label: "Become a Partner", href: site.partnerUrl, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of Service", href: site.legal.links.terms, external: true },
      { label: "Privacy Policy", href: site.legal.links.privacy, external: true },
      {
        label: "Partner Policy",
        href: site.legal.links.partnerPolicy,
        external: true,
      },
      { label: "Refund Policy", href: site.legal.links.refund, external: true },
    ],
  },
];

export const socialLinks = [
  { label: "Facebook", href: "https://www.facebook.com/levoy", icon: "facebook" },
  { label: "Twitter", href: "https://x.com/levoy", icon: "twitter" },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/levoy",
    icon: "linkedin",
  },
  { label: "Instagram", href: "https://www.instagram.com/levoy_", icon: "instagram" },
  { label: "YouTube", href: "https://www.youtube.com/@levoy", icon: "youtube" },
] as const;
