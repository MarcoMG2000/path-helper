import { es } from "../../i18n/es";
import { defineSection } from "../../shell/sections";
import { ProfilePage } from "./profile-page";

export default defineSection({
  id: "profile",
  path: "/perfil",
  label: es.nav.profile,
  roles: ["player", "gm"],
  order: 90,
  Component: ProfilePage,
});
