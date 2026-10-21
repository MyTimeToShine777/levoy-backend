import { ButtonLink } from "@/components/ui/primitives";
import { CallioLogo, Icon, SocialIcon } from "@/components/ui/icons";
import { footerColumns, site, socialLinks } from "@/lib/site";

/** Site footer: brand block, contact details, link columns and legal line. */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer id="footer" className="bg-ink-950 text-ink-300">
      <div className="container-page py-14 lg:py-18">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2fr]">
          {/* Brand + contact */}
          <div>
            <CallioLogo tone="dark" markClassName="h-12" />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-400">
              {site.tagline} Monitor every telesales and marketing call from one
              central dashboard and turn calling data into decisions.
            </p>

            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex gap-3">
                <Icon
                  name="phone"
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand-400"
                />
                <a
                  href={site.contact.phoneHref}
                  className="font-semibold text-ink-200 transition-colors hover:text-brand-300"
                >
                  {site.contact.phone}
                </a>
              </li>
              <li className="flex gap-3">
                <Icon
                  name="mail"
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand-400"
                />
                <a
                  href={`mailto:${site.contact.email}`}
                  className="font-semibold text-ink-200 transition-colors hover:text-brand-300"
                >
                  {site.contact.email}
                </a>
              </li>
              <li className="flex gap-3">
                <Icon
                  name="target"
                  className="mt-0.5 h-4 w-4 shrink-0 text-brand-400"
                />
                <address className="not-italic leading-relaxed text-ink-400">
                  {site.contact.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </li>
            </ul>

            <ul className="mt-6 flex flex-wrap gap-2">
              {socialLinks.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-ink-800 text-ink-400 transition-all hover:-translate-y-0.5 hover:border-brand-500 hover:bg-brand-500 hover:text-white"
                  >
                    <SocialIcon name={s.icon} className="h-4.5 w-4.5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h3 className="text-2xs font-extrabold tracking-[0.12em] text-white uppercase">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...("external" in link && link.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-sm font-medium text-ink-400 transition-colors hover:text-brand-300"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Pre-footer CTA */}
        <div className="mt-12 flex flex-col items-start justify-between gap-5 rounded-card border border-ink-800 bg-ink-900/70 p-6 sm:flex-row sm:items-center lg:p-8">
          <div>
            <p className="text-lg font-extrabold text-white">
              Ready to see your real telecalling numbers?
            </p>
            <p className="mt-1.5 text-sm text-ink-400">
              Install the app on your team&apos;s phones and watch the first
              report arrive tomorrow morning.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <ButtonLink href={site.appUrl} size="md" external>
              Sign Up Now
            </ButtonLink>
            <ButtonLink
              href={`mailto:${site.contact.email}`}
              variant="onDarkGhost"
              size="md"
            >
              Contact Sales
            </ButtonLink>
          </div>
        </div>

        {/* Legal */}
        <div className="mt-10 flex flex-col gap-3 border-t border-ink-800 pt-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.legal.company}. All Rights Reserved.{" "}
            <span className="font-bold text-ink-300">Callio®</span>
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {footerColumns[2].links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="transition-colors hover:text-brand-300"
              >
                {l.label}
              </a>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}
