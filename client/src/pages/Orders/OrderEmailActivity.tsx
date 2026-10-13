import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Eye, Mail, RefreshCw, Send, XCircle } from "lucide-react";
import { Button, Modal, ModalFooter } from "../../components/common";
import type { OrderEmailAudit } from "../../context/Orders/constants";
import styles from "./Orders.module.css";

const titleFor = (template: string) => ({
  newOrderAlert: "New order alert",
  orderConfirmation: "Order confirmation",
  orderDispatched: "Dispatch notification",
  orderInTransit: "In-transit notification",
  deliveryProof: "Delivery confirmation",
  refundConfirmation: "Refund confirmation",
}[template] || template.replace(/([a-z])([A-Z])/g, "$1 $2"));

const sanitizeEmailPreview = (html: string, deliveryProofUrl?: string) => {
  const document = new DOMParser().parseFromString(html, "text/html");
  document
    .querySelectorAll("script, object, embed, form, base, link, meta[http-equiv], style")
    .forEach((element) => element.remove());

  document.querySelectorAll<HTMLElement>("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith("on") ||
        name === "srcset" ||
        (name === "style" && /url\s*\(/i.test(attribute.value)) ||
        ((name === "href" || name === "src") && value.startsWith("javascript:"))
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  document.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    const source = image.getAttribute("src") || "";
    const isLogo = /levants|logo/i.test(image.alt || "");
    if (isLogo && (/^https:\/\//i.test(source) || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(source))) {
      image.referrerPolicy = "no-referrer";
      return;
    }
    const isDeliveryProof = image.alt?.toLowerCase() === "delivery proof";
    if (isDeliveryProof && deliveryProofUrl) {
      image.src = deliveryProofUrl;
      image.referrerPolicy = "no-referrer";
      image.loading = "lazy";
      return;
    }
    image.removeAttribute("src");
    image.removeAttribute("srcset");
    image.alt = image.alt || "Remote image hidden for privacy";
  });

  document.querySelectorAll<HTMLAnchorElement>("a").forEach((anchor) => {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  });

  return `<!doctype html>${document.documentElement.outerHTML}`;
};

export default function OrderEmailActivity({
  emails,
  deliveryProofUrl,
  loading,
  error,
  onRefresh,
}: {
  emails: OrderEmailAudit[];
  deliveryProofUrl?: string;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [previewEmail, setPreviewEmail] = useState<OrderEmailAudit | null>(null);
  const previewProvider = previewEmail?.provider;
  const previewHtml = useMemo(() => {
    const html = previewProvider?.html;
    return html ? sanitizeEmailPreview(html, deliveryProofUrl) : html;
  }, [deliveryProofUrl, previewProvider?.html]);

  return (
    <>
      <section className={styles.emailAuditSection} aria-labelledby="email-activity-heading">
      <div className={styles.auditSectionHeader}>
        <div>
          <h2 id="email-activity-heading">Email activity</h2>
          <p>Customer emails with the latest delivery status from Resend.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={15} className={loading ? styles.spinnerIcon : undefined} />
          Refresh
        </Button>
      </div>

      {error ? <p className={styles.auditError} role="alert">{error}</p> : null}
      {!loading && !error && emails.length === 0 ? (
        <div className={styles.auditEmpty}><Mail size={18} /><span>No email previews have been recorded for this order.</span></div>
      ) : null}
      <div className={styles.emailAuditList}>
        {emails.map((email, index) => {
          const provider = email.provider;
          const status = provider?.lastEvent || email.providerStatus;
          const eventIcon = ["delivered", "opened", "clicked"].includes(status)
            ? CheckCircle2
            : ["failed", "bounced", "complained", "canceled"].includes(status)
              ? XCircle
              : Clock;
          const StatusIcon = eventIcon;
          return (
            <article className={styles.emailAuditItem} key={email.providerId || `${email.template}-${email.sentAt}-${index}`}>
              <div className={styles.emailAuditSummary}>
                <span className={styles.emailIcon}><Mail size={17} /></span>
                <span className={styles.emailSummaryText}>
                  <strong>{titleFor(email.template)}</strong>
                  <small>{provider?.subject || email.subject} · {new Date(email.sentAt).toLocaleString("en-GB")}</small>
                </span>
                <span className={`${styles.emailStatus} ${styles[`emailStatus_${status}`] || ""}`}>{String(status || "sent").replace(/_/g, " ")}</span>
                {provider?.html ? (
                  <Button variant="outline" size="sm" onClick={() => setPreviewEmail(email)}>
                    <Eye size={15} aria-hidden="true" />
                    View full email
                  </Button>
                ) : null}
              </div>
              <div className={styles.emailEvents}>
                <h3>Email events</h3>
                <ol className={styles.emailEventTimeline} aria-label={`${titleFor(email.template)} delivery events`}>
                  <li className={styles.emailEvent}>
                    <span className={styles.emailEventIcon}><Send size={22} aria-hidden="true" /></span>
                    <span className={styles.emailStatus}>Sent</span>
                    <time dateTime={email.sentAt}>{new Date(email.sentAt).toLocaleString("en-GB", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</time>
                  </li>
                  {status !== "sent" && (
                    <li className={`${styles.emailEvent} ${styles[`emailEvent_${status}`] || ""}`}>
                      <span className={styles.emailEventIcon}><StatusIcon size={22} aria-hidden="true" /></span>
                      <span className={`${styles.emailStatus} ${styles[`emailStatus_${status}`] || ""}`}>{status.replace(/_/g, " ")}</span>
                      <small>{status === "unavailable" ? "Status unavailable" : "Confirmed by Resend"}</small>
                    </li>
                  )}
                </ol>
              </div>
              {email.providerError ? <p className={styles.emailUnavailable}>{email.providerError}</p> : null}
              {!provider?.html ? (
                <p className={styles.emailUnavailable}>This email was sent before previews were recorded, so its content is unavailable.</p>
              ) : null}
            </article>
          );
        })}
      </div>
      </section>

      <Modal
        isOpen={Boolean(previewEmail)}
        onClose={() => setPreviewEmail(null)}
        title={previewEmail ? titleFor(previewEmail.template) : "Email preview"}
        size="xl"
      >
        {previewEmail && previewHtml ? (
          <div className={styles.emailCustomerPreview}>
            <div className={styles.emailCustomerCanvas}>
              <iframe
                title={`${titleFor(previewEmail.template)} customer email`}
                sandbox=""
                srcDoc={previewHtml}
                referrerPolicy="no-referrer"
                scrolling="auto"
              />
            </div>
          </div>
        ) : null}
        <ModalFooter>
          <Button variant="outline" onClick={() => setPreviewEmail(null)}>Close</Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
