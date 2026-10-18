// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PinField } from "../../../src/web/components/pin-field";
import { es } from "../../../src/web/i18n/es";

afterEach(cleanup);

function Harness() {
  const [value, setValue] = useState("");
  return (
    <PinField
      id="pin"
      label={es.login.pin}
      value={value}
      onChange={setValue}
      autoComplete="current-password"
    />
  );
}

const input = () => document.getElementById("pin") as HTMLInputElement;
const toggle = () => screen.getByRole("button", { name: es.a11y.pinToggle(es.login.pin) });

describe("PinField", () => {
  it("R49: el PIN está oculto por defecto y el botón tiene aria-pressed=false", () => {
    render(<Harness />);
    expect(input().type).toBe("password");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    expect(toggle().textContent).toBe(es.common.show);
  });

  it("R49: el botón alterna password/text conservando el valor", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(input(), "1234");
    await user.click(toggle());
    expect(input().type).toBe("text");
    expect(input().value).toBe("1234");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(toggle().textContent).toBe(es.common.hide);
    await user.click(toggle());
    expect(input().type).toBe("password");
    expect(input().value).toBe("1234");
  });

  it("R49: el botón no envía el formulario (type=button)", () => {
    render(<Harness />);
    expect(toggle().getAttribute("type")).toBe("button");
  });

  it("R48: el campo es numérico y declara el autocomplete recibido", () => {
    render(<Harness />);
    expect(input().getAttribute("inputmode")).toBe("numeric");
    expect(input().getAttribute("pattern")).toBe("[0-9]*");
    expect(input().getAttribute("autocomplete")).toBe("current-password");
  });
});
