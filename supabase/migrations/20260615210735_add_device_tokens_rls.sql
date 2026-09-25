create policy "Users can insert their own device tokens"
  on public.device_tokens for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read their own device tokens"
  on public.device_tokens for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update their own device tokens"
  on public.device_tokens for update
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can delete their own device tokens"
  on public.device_tokens for delete
  to authenticated
  using (auth.uid() = user_id);