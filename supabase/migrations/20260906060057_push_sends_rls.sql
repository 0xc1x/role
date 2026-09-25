-- push_sends es solo para el backend (service role): RLS activado sin policies
ALTER TABLE push_sends ENABLE ROW LEVEL SECURITY;