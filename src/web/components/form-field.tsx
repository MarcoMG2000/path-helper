import type { ReactNode } from "react";

export interface ControlProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (control: ControlProps) => ReactNode;
}

// R77: etiqueta asociada, error enlazado con aria-describedby/aria-invalid y expuesto en role="alert".
export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  const control: ControlProps = { id };
  if (error) control["aria-invalid"] = true;
  if (describedBy) control["aria-describedby"] = describedBy;
  return (
    <div className="ph-field">
      <label className="ph-field__label" htmlFor={id}>
        {label}
      </label>
      {children(control)}
      {hint ? (
        <p className="ph-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ph-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
