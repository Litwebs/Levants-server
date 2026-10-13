import { forwardRef, type InputHTMLAttributes } from "react";
import styles from "./Toggle.module.css";

interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  containerClassName?: string;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ containerClassName = "", className = "", ...props }, ref) => (
    <label className={`${styles.toggle} ${containerClassName}`}>
      <input
        ref={ref}
        type="checkbox"
        className={`${styles.input} ${className}`}
        {...props}
      />
      <span className={styles.slider} aria-hidden="true" />
    </label>
  ),
);

Toggle.displayName = "Toggle";
