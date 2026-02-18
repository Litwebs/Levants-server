import React from 'react';
import styles from './FormGrid.module.css';

interface FormGridProps {
  children: React.ReactNode;
  className?: string;
}

export const FormGrid: React.FC<FormGridProps> = ({ children, className = '' }) => {
  return (
    <div className={`${styles.formGrid} ${className}`}>
      {children}
    </div>
  );
};

interface FormRowProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormRow: React.FC<FormRowProps> = ({ label, htmlFor, children, className = '' }) => {
  return (
    <div className={`${styles.formRow} ${className}`}>
      <label htmlFor={htmlFor} className={styles.formLabel}>
        {label}
      </label>
      <div className={styles.formControl}>
        {children}
      </div>
    </div>
  );
};

interface FormValueProps {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
  className?: string;
}

export const FormValue: React.FC<FormValueProps> = ({ label, value, muted = false, className = '' }) => {
  return (
    <div className={`${styles.formRow} ${className}`}>
      <span className={styles.formLabel}>{label}</span>
      <span className={`${styles.formValue} ${muted ? styles.muted : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
};

interface FormSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({ title, children, className = '' }) => {
  return (
    <div className={`${styles.formSection} ${className}`}>
      {title && <h4 className={styles.formSectionTitle}>{title}</h4>}
      {children}
    </div>
  );
};

FormGrid.displayName = 'FormGrid';
FormRow.displayName = 'FormRow';
FormValue.displayName = 'FormValue';
FormSection.displayName = 'FormSection';
