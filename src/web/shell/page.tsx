import { useEffect, useRef, type ReactNode } from "react";
import { es } from "../i18n/es";

// R37: un h1 por pantalla; al montar o cambiar el título se actualiza document.title y se mueve
// el foco al h1 (así los lectores de pantalla anuncian el cambio de ruta). R91: `documentTitle`
// permite que el título de la pestaña (que queda en el historial) no lleve datos personales.
export function Page({
  title,
  documentTitle = title,
  children,
}: {
  title: string;
  documentTitle?: string;
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = es.pageTitle(documentTitle);
    heading.current?.focus();
  }, [title, documentTitle]);
  return (
    <>
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {children}
    </>
  );
}
