import type { ClientErrorCode } from "../api/http-client";

// Textos de la UI en español; los componentes no hardcodean literales visibles (R75).
// `errors` está tipado con ClientErrorCode: si ErrorCode crece, tsc falla hasta añadir el texto (R76).
type ErrorText = string | ((wait: string) => string);

const errors = {
  validation_error: "Los datos introducidos no son válidos.",
  unauthenticated: "Tu sesión ha caducado. Vuelve a entrar.",
  forbidden: "No tienes permiso para esta operación.",
  not_found: "No se ha encontrado el elemento. Puede que ya no exista.",
  invalid_credentials: "Nombre o PIN incorrectos. Si el problema continúa, habla con el GM.",
  locked: (wait) => `Demasiados intentos fallidos. Vuelve a intentarlo en ${wait}.`,
  name_taken: "Ya existe una cuenta con ese nombre.",
  cannot_disable_gm: "No se puede deshabilitar la cuenta del GM.",
  invalid_current_pin: "El PIN actual no es correcto.",
  bad_origin:
    "Petición rechazada por seguridad. Abre la app desde la dirección habitual y recarga la página.",
  gm_exists: "Ya existe una cuenta de GM.",
  internal_error: "Ha ocurrido un error inesperado.",
  network: "No se pudo conectar con el servidor. Comprueba tu conexión.",
  unexpected: "Ha ocurrido un error inesperado.",
} satisfies Record<ClientErrorCode, ErrorText>;

const APP_NAME = "Path Helper";

export const es = {
  appName: APP_NAME,
  pageTitle: (title: string) => `${title} · ${APP_NAME}`,
  health: {
    loading: "Comprobando la API…",
    ok: "API conectada",
    error: "API no disponible",
  },
  common: {
    loading: "Cargando…",
    retry: "Reintentar",
    cancel: "Cancelar",
    confirm: "Confirmar",
    save: "Guardar",
    reload: "Recargar",
    show: "Mostrar",
    hide: "Ocultar",
    back: "Volver",
    backHome: "Volver al inicio",
  },
  roles: { player: "Jugador", gm: "GM" },
  a11y: {
    skipToContent: "Saltar al contenido",
    mainNav: "Navegación principal",
    pinToggle: (label: string) => `Mostrar ${label}`,
  },
  nav: { home: "Inicio", profile: "Mi perfil", accounts: "Cuentas" },
  layout: {
    signedInAs: (name: string, role: string) => `${name} (${role})`,
    legalLink: "Aviso legal",
  },
  wait: {
    unknown: "unos minutos",
    minute: ["minuto", "minutos"] as const,
    hour: ["hora", "horas"] as const,
    and: "y",
  },
  session: {
    checking: "Comprobando la sesión…",
    checkFailed: "No se pudo comprobar la sesión",
    checkFailedHint: "No se pudo contactar con el servidor. Inténtalo de nuevo.",
    expired: "Tu sesión ha caducado. Vuelve a entrar.",
    signedOutElsewhere: "Has cerrado sesión en otra pestaña.",
    logoutFailed: "No se pudo cerrar la sesión. Inténtalo de nuevo.",
  },
  errors,
  login: {
    title: "Entrar",
    name: "Nombre",
    pin: "PIN",
    submit: "Entrar",
    submitting: "Entrando…",
    nameRequired: "Escribe tu nombre.",
    pinRequired: "Escribe tu PIN.",
  },
  profile: {
    title: "Mi perfil",
    name: "Nombre",
    role: "Rol",
    changePin: {
      title: "Cambiar PIN",
      current: "PIN actual",
      next: "PIN nuevo",
      repeat: "Repite el PIN nuevo",
      hint: "De 4 a 8 dígitos.",
      submit: "Cambiar PIN",
      submitting: "Cambiando…",
      currentRequired: "Escribe tu PIN actual.",
      nextInvalid: "El PIN nuevo debe tener entre 4 y 8 dígitos.",
      mismatch: "Los PIN no coinciden.",
      success: "PIN cambiado. Se han cerrado tus otras sesiones.",
    },
    logout: { title: "Sesión", button: "Cerrar sesión" },
  },
  accounts: {
    title: "Cuentas",
    create: {
      title: "Nueva cuenta",
      name: "Nombre",
      nameHint: "De 1 a 32 caracteres.",
      pin: "PIN inicial",
      pinHint: "De 4 a 8 dígitos. Comunícaselo al jugador.",
      submit: "Crear cuenta",
      submitting: "Creando…",
      nameInvalid:
        "El nombre debe tener entre 1 y 32 caracteres y no puede incluir caracteres de control.",
      pinInvalid: "El PIN debe tener entre 4 y 8 dígitos.",
      success: (name: string) => `Cuenta «${name}» creada.`,
    },
    list: {
      title: "Cuentas existentes",
      loadFailed: (reason: string) => `No se pudieron cargar las cuentas. ${reason}`,
      empty: "Todavía no hay cuentas.",
    },
    row: {
      you: "(tú)",
      active: "Activa",
      disabled: "Deshabilitada",
      meta: (role: string, active: boolean) => `${role} · ${active ? "Activa" : "Deshabilitada"}`,
      resetPin: "Restablecer PIN",
      resetPinFor: (name: string) => `Restablecer PIN de ${name}`,
      disable: "Deshabilitar",
      disableFor: (name: string) => `Deshabilitar a ${name}`,
      enable: "Habilitar",
      enableFor: (name: string) => `Habilitar a ${name}`,
      unlock: "Desbloquear",
      unlockFor: (name: string) => `Desbloquear a ${name}`,
      gmHint: "Cambia tu PIN en «Mi perfil».",
      newPin: "Nuevo PIN",
      newPinHint: "De 4 a 8 dígitos.",
      newPinInvalid: "El PIN debe tener entre 4 y 8 dígitos.",
      savePin: "Guardar PIN",
      confirmDisable: (name: string) =>
        `¿Deshabilitar la cuenta de ${name}? Se cerrarán sus sesiones y no podrá entrar.`,
      confirmDisableYes: "Sí, deshabilitar",
      busy: "Procesando…",
      resetSuccess: "PIN restablecido. Se han cerrado sus sesiones y se ha quitado su bloqueo.",
      unlockSuccess: "Cuenta desbloqueada.",
      disableSuccess: "Cuenta deshabilitada. Se han cerrado sus sesiones.",
      enableSuccess: "Cuenta habilitada.",
    },
  },
  home: {
    greeting: (name: string) => `Hola, ${name}`,
    sections: "Secciones",
    noSections: "Aún no hay secciones disponibles para tu rol.",
  },
  legal: {
    title: "Aviso legal",
    unofficial: "Proyecto no oficial",
    section15: "Section 15: Copyright Notice",
    ogl: "Texto íntegro de la Open Game License v1.0a",
  },
  notFound: {
    title: "Página no encontrada",
    message: "La página que buscas no existe.",
  },
  forbidden: {
    title: "Sin permiso",
    message: "No tienes permiso para ver esta página.",
  },
  crash: {
    title: "Algo ha fallado",
    message: "Ha ocurrido un error inesperado en la aplicación.",
    reload: "Recargar",
  },
};
