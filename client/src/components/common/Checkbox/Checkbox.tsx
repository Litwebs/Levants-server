import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
} from "react";
import { Check, Minus } from "lucide-react";
import styles from "./Checkbox.module.css";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ indeterminate = false, className = "", ...props }, forwardedRef) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

    useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <span className={`${styles.root} ${className}`}>
        <input
          {...props}
          ref={inputRef}
          type="checkbox"
          className={styles.input}
        />
        <span className={styles.box} aria-hidden="true">
          <Check className={styles.check} size={13} strokeWidth={3} />
          <Minus className={styles.minus} size={13} strokeWidth={3} />
        </span>
      </span>
    );
  },
);

Checkbox.displayName = "Checkbox";
