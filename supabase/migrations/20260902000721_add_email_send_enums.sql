do $$ begin
  create type email_send_type as enum ('campaign','transactional','newsletter','notification','test');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type email_send_status add value if not exists 'pending' before 'queued';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type email_send_status add value if not exists 'processing' after 'queued';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type email_send_status add value if not exists 'cancelled' after 'failed';
exception when duplicate_object then null;
end $$;