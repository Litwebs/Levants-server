import React, { useEffect, forwardRef, ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./Modal.module.css";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  showCloseButton?: boolean;
}

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    { isOpen, onClose, title, children, size = "md", showCloseButton = true },
    ref,
  ) => {
    useEffect(() => {
      document.body.style.overflow = isOpen ? "hidden" : "";
      return () => {
        document.body.style.overflow = "";
      };
    }, [isOpen]);

    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isOpen) onClose();
      };
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // 👇 Split footer from body
    const childrenArray = React.Children.toArray(children);
    const footer = childrenArray.find(
      (child: any) => child?.type?.displayName === "ModalFooter",
    );
    const content = childrenArray.filter(
      (child: any) => child?.type?.displayName !== "ModalFooter",
    );

    return (
      <div className={styles.overlay} onClick={onClose}>
        <div
          ref={ref}
          className={`${styles.modal} ${styles[size]}`}
          onClick={(e) => e.stopPropagation()}
        >
          {(title || showCloseButton) && (
            <div className={styles.header}>
              {title && <h2 className={styles.title}>{title}</h2>}
              {showCloseButton && (
                <button
                  className={styles.closeButton}
                  onClick={onClose}
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
      </div>
    );
  },
);

Modal.displayName = "Modal";

export const ModalFooter: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <div className={styles.footer}>{children}</div>;

ModalFooter.displayName = "ModalFooter";
