import type { AppRole } from '@0xc1x/role-commons';

/**
 * La identidad que el guard cuelga de la request.
 *
 * ─── POR QUÉ `full_name` Y `avatar_url` ESTÁN AQUÍ ───────────────────────────
 *
 * `GET /auth/me` devuelve ESTE objeto, y el panel admin lo muestra tal cual: el
 * nombre en la barra lateral ("Ada Admin" arriba, el correo abajo) y el
 * saludo de la home ("Bienvenido, {nombre}"). Sin `full_name` en este tipo, el
 * guard no lo selecteaba y `/auth/me` respondía `{id, email, role}`: el panel
 * caía al `?? user.email` y pintaba el CORREO donde debía ir el nombre.
 *
 * El contrato de `commons` (`AuthUserSchema`) ya declaraba `full_name` y
 * `avatar_url` como nulables: lo que faltaba no era el contrato, era que la
 * API sirviera la respuesta completa. `AuthUserSchema` es la forma que el
 * panel valida, y por eso estos dos campos tienen que existir aquí también.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
}
