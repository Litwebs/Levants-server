import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Modal, ModalFooter } from "../../components/common";
import styles from "./UnsavedChangesDialog.module.css";

export function useUnsavedChangesDialog(dirty: boolean, item: "product" | "variant") {
  const navigate = useNavigate();
  const allowNavigationRef = useRef(false);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (allowNavigationRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(nextUrl.href);
    };
    const onPopState = () => {
      if (allowNavigationRef.current) return;
      const nextUrl = window.location.href;
      allowNavigationRef.current = true;
      window.history.forward();
      window.setTimeout(() => { allowNavigationRef.current = false; }, 0);
      setTarget(nextUrl);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [dirty]);

  const keepEditing = () => setTarget(null);
  const discardChanges = () => {
    if (!target) return;
    allowNavigationRef.current = true;
    const nextUrl = new URL(target, window.location.href);
    setTarget(null);
    if (nextUrl.origin === window.location.origin) navigate(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    else window.location.assign(nextUrl.href);
  };

  const dialog = (
    <Modal isOpen={Boolean(target)} onClose={keepEditing} title="Discard changes?" size="sm" showCloseButton={false}>
      <p>You have unsaved {item} changes. If you leave now, those changes will be lost.</p>
      <ModalFooter>
        <Button variant="outline" onClick={keepEditing}>Keep editing</Button>
        <Button variant="outline" className={styles.discardButton} onClick={discardChanges}>Discard changes</Button>
      </ModalFooter>
    </Modal>
  );

  return { allowNavigationRef, dialog };
}
