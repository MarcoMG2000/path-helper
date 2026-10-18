import { useState, type Ref } from "react";
import { es } from "../i18n/es";
import type { ControlProps } from "./form-field";

interface PinFieldProps extends ControlProps {
  /** Texto de la etiqueta; da nombre accesible al botón de mostrar/ocultar. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  enterKeyHint?: "go" | "next" | "done";
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

// R49: oculto por defecto; el botón alterna type password/text conservando el valor.
// El PIN solo vive en el estado del formulario que lo contiene (R51).
export function PinField({
  label,
  value,
  onChange,
  inputRef,
  enterKeyHint,
  ...rest
}: PinFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="ph-pin">
      <input
        {...rest}
        ref={inputRef}
        className="ph-input"
        type={visible ? "text" : "password"}
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint={enterKeyHint}
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="ph-button"
        aria-pressed={visible}
        aria-label={es.a11y.pinToggle(label)}
        disabled={rest.disabled}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? es.common.hide : es.common.show}
      </button>
    </div>
  );
}
