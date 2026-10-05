-- La PK es (announcement_id, user_id), con ANUNCIOS como columna lider, y la
-- policy de SELECT filtra por user_id = auth.uid(): la columna TRAILING. Postgres no
-- tiene skip scan, asi que la consulta de ids ya entendidos --que es
-- .select("announcement_id") sin filtro, porque la policy ya la acotó-- resuelve por
-- seq scan de TODA la tabla de acks de la base, no de los de la persona.
--
-- No es un problema de hoy con la tabla vacía, y esa es la trampa: el costo crece con
-- cada acknowledgement sin que nadie toque código, y en cada arranque, porque la
-- consulta vive dentro del unico fetch de la secuencia de modales. El indice es
-- aditivo y no toca ninguna policy.
--
-- A futuro: esto se cierra solo en cuanto announcements tenga su propio indice por
-- user_ids, o si la consulta deja de traer la lista entera. Se agrega ahora porque un
-- indice que falta es trabajo pendiente con forma de indice; el resto de los problemas
-- abiertos de esta feature son decisiones de producto o coste aceptado.
create index if not exists idx_announcement_acknowledgements_user
	on public.announcement_acknowledgements (user_id);