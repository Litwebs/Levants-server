import React, { useEffect, useId, useRef, forwardRef, ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./Modal.module.css";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showCloseButton?: boolean;
  closeDisabled?: boolean;
}

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      children,
      size = "md",
      showCloseButton = true,
      closeDisabled = false,
    },
    ref,
  ) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const onCloseRef = useRef(onClose);
    onCloseRef.current = () => {
      if (!closeDisabled) onClose();
    };

    useEffect(() => {
      if (!isOpen) return;
      const previousFocus = document.activeElement as HTMLElement | null;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialogRef.current?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCloseRef.current();
          return;
        }
        if (event.key !== "Tab") return;
        const dialog = dialogRef.current;
        if (!dialog) return;
        const elements = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (element) =>
            !element.closest('[hidden], [aria-hidden="true"]') &&
            element.tabIndex >= 0,
        );
        if (!elements.length) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        const first = elements[0];
        const last = elements[elements.length - 1];
        const active = document.activeElement;
        const outside = !dialog.contains(active) || active === dialog;
        if (event.shiftKey && (active === first || outside)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || outside)) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = previousOverflow;
        if (previousFocus?.isConnected) previousFocus.focus();
      };
    }, [isOpen]);

    if (!isOpen) return null;

    // 👇 Split footer from body
    const childrenArray = React.Children.toArray(children);
    const footer = childrenArray.find(
      (child: any) => child?.type?.displayName === "ModalFooter",
    );
    const content = childrenArray.filter(
      (child: any) => child?.type?.displayName !== "ModalFooter",
    );

    return createPortal(
      <div className={styles.overlay} onClick={() => onCloseRef.current()}>
        <div
          ref={(node) => {
            dialogRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-label={title ? undefined : "Dialog"}
          tabIndex={-1}
          className={`${styles.modal} ${styles[size]}`}
          onClick={(e) => e.stopPropagation()}
        >
          {(title || showCloseButton) && (
            <div className={styles.header}>
              {title && (
                <h2 id={titleId} className={styles.title}>
                  {title}
                </h2>
              )}
              {showCloseButton && (
                <button
                  type="button"
                  className={styles.closeButton}
                  disabled={closeDisabled}
                  onClick={() => onCloseRef.current()}
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          )}

          {/* ✅ Scrollable area */}
          <div className={styles.content}>{content}</div>

          {/* ✅ Fixed footer */}
          {footer}
        </div>
      </div>,
      document.body,
    );
  },
);

Modal.displayName = "Modal";

export const ModalFooter: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <div className={styles.footer}>{children}</div>;

ModalFooter.displayName = "ModalFooter";
