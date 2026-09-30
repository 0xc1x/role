/**
 * Un ítem del menú está activo cuando su ruta es la que se está viendo.
 *
 * La comparación va sobre el PATHNAME y no sobre la URL completa porque las
 * superficies con pestañas cambian `?tab=` sin cambiar de ruta. Notificaciones
 * tiene cuatro (`enviar`, `plantillas`, `historial`, `dispositivos`) y el query
 * es toda la máquina de estado de esa pantalla: con la comparación completa,
 * cambiar de pestaña desmarcaba el ícono de Notificaciones y su sección se
 * cerraba, que es justo la mitad de lo que el operador está haciendo ahí.
 *
 * Un ítem que sí lleve query en su `url` tiene que coincidir entero, así que
 * ese caso conserva la comparación exacta. La regla no depende entonces de que
 * hoy ningún ítem del menú lleve query.
 */
export function isNavItemActive(
	itemUrl: string,
	pathname: string,
	currentUrl: string,
): boolean {
	return itemUrl.includes("?") ? currentUrl === itemUrl : pathname === itemUrl;
}
