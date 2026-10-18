import type { Ref } from "react";
import type { ControlProps } from "./form-field";

interface TextInputProps extends ControlProps {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  autoCapitalize?: string;
  spellCheck?: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

export function TextInput({ value, onChange, inputRef, ...rest }: TextInputProps) {
  return (
    <input
      {...rest}
      ref={inputRef}
      className="ph-input"
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
