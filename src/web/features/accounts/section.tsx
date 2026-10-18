import { es } from "../../i18n/es";
import { defineSection } from "../../shell/sections";
import { AccountsPage } from "./accounts-page";

export default defineSection({
  id: "accounts",
  path: "/cuentas",
  label: es.nav.accounts,
  roles: ["gm"],
  order: 50,
  Component: AccountsPage,
});
