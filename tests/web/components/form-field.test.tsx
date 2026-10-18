// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Alert } from "../../../src/web/components/alert";
import { FormField } from "../../../src/web/components/form-field";

afterEach(cleanup);

function field(props: { error?: string; hint?: string } = {}) {
  render(
    <FormField id="campo" label="Etiqueta" {...props}>
      {(control) => <input {...control} />}
    </FormField>,
  );
  return screen.getByLabelText("Etiqueta");
}

describe("FormField", () => {
  it("R77: con error marca aria-invalid, enlaza aria-describedby y expone el mensaje en role=alert", () => {
    const input = field({ error: "Algo va mal" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Algo va mal");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("R77: sin error no hay aria-invalid ni alerta", () => {
    const input = field();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("R77: la ayuda también se enlaza por aria-describedby, junto al error", () => {
    const input = field({ error: "Mal", hint: "Ayuda" });
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent).sort()).toEqual([
      "Ayuda",
      "Mal",
    ]);
  });

  it("R41: la etiqueta está asociada al control con label/for", () => {
    const input = field();
    expect(input.id).toBe("campo");
  });
});

describe("Alert", () => {
  it("los errores usan role=alert y el resto role=status", () => {
    render(
      <>
        <Alert kind="error">e</Alert>
        <Alert kind="success">s</Alert>
        <Alert kind="info">i</Alert>
      </>,
    );
    expect(screen.getAllByRole("alert").map((n) => n.textContent)).toEqual(["e"]);
    expect(screen.getAllByRole("status").map((n) => n.textContent)).toEqual(["s", "i"]);
  });
});
